#if os(macOS)
import XCTest
import AppKit
import SwiftUI
import CoreGraphics
import KlartKit
@testable import Klart

// SwiftUI forbids mutating an observed `@Published` from inside its own update
// pass — it logs "Publishing changes from within view updates is not allowed"
// and the behaviour past that point is undefined. The editor has two ways to
// land there, and neither is obvious from reading the call site:
//
//   * `NotificationCenter.addObserver(forName:object:queue: .main)` does not
//     defer when the notification is posted on the main thread. The block runs
//     inline on the poster's stack, and AppKit posts the clip view's bounds
//     change from inside whatever moved it — which, while the notes rail
//     springs the writing column's width, is SwiftUI itself.
//   * assigning `NSTextView.string` re-enters `textViewDidChangeSelection`
//     synchronously, and both `makeNSView` and `updateNSView` do that from
//     inside the update pass.
//
// Every test here pins the same invariant from a different side: the publish
// happens a turn of the run loop later, never on the stack that caused it.
// They assert against counters rather than the log, because the warning itself
// only reaches `com.apple.runtime-issues` and cannot be seen from in here.

@MainActor
final class EditorPublishTests: XCTestCase {
    private var fixture: EditorFixture?

    override func tearDown() {
        fixture = nil
        super.tearDown()
    }

    private func makeFixture(_ text: String) -> EditorFixture {
        let made = EditorFixture(text)
        fixture = made
        return made
    }

    private func longNote(lines: Int = 80) -> String {
        "# A long note\n" + (1...lines).map { "Line \($0) of the body." }.joined(separator: "\n")
    }

    // MARK: The tick lands a turn later

    /// The exact stack the warning was reported on: something moves the clip
    /// view, AppKit posts the bounds change inline, and the observer runs before
    /// the mover's frame returns. If `layoutTick` has already moved by the time
    /// the scroll call returns, then during the rail's animation it moved inside
    /// SwiftUI's update pass.
    func testABoundsChangeDoesNotPublishOnThePostersStack() {
        let editor = makeFixture(longNote())
        editor.waitUntilReady()
        pumpFor(0.1)

        let before = editor.bridge.layoutTick
        editor.scrollView.contentView.scroll(to: NSPoint(x: 0, y: editor.scrollOffset + 160))

        XCTAssertEqual(
            editor.bridge.layoutTick, before,
            "layoutTick was published on the stack that posted the bounds change"
        )
        XCTAssertTrue(
            pump(until: { editor.bridge.layoutTick > before }),
            "the deferred tick never arrived, so the rail would never re-anchor"
        )
    }

    /// `bump()` is called from `textDidChange`, which AppKit can deliver while
    /// SwiftUI is mid-update too. Same rule.
    func testAnEditDoesNotPublishOnTheCallersStack() {
        let editor = makeFixture(longNote())
        editor.waitUntilReady()
        pumpFor(0.1)

        let before = editor.bridge.layoutTick
        editor.bridge.bump()

        XCTAssertEqual(editor.bridge.layoutTick, before, "bump() published synchronously")
        XCTAssertTrue(pump(until: { editor.bridge.layoutTick > before }), "the edit's tick never arrived")
    }

    // MARK: One tick per turn, however many notifications

    /// A single width change posts several bounds notifications and a second of
    /// typewriter scrolling posts closer to two hundred, while the rail can only
    /// draw one placement per frame regardless. Without coalescing each
    /// notification is its own publish, and each publish costs the rail a
    /// whole-document outline parse.
    func testManyBoundsChangesInOneTurnPublishOneTick() {
        let editor = makeFixture(longNote())
        editor.waitUntilReady()
        pumpFor(0.1)

        let before = editor.bridge.layoutTick
        for step in 1...40 {
            editor.scrollView.contentView.scroll(to: NSPoint(x: 0, y: CGFloat(step) * 12))
        }
        XCTAssertEqual(editor.bridge.layoutTick, before, "published before the turn ended")

        XCTAssertTrue(pump(until: { editor.bridge.layoutTick > before }))
        XCTAssertEqual(
            editor.bridge.layoutTick, before + 1,
            "40 bounds changes in one turn should coalesce into a single tick"
        )
    }

    // MARK: A tick nothing can read differently is not sent

    /// Bounds changes also arrive for horizontal scrolls and for origin clamps
    /// that land back where they started. Nothing a card reads has moved, so
    /// publishing costs an outline parse for an identical answer.
    func testABoundsChangeThatLandsBackWhereItStartedPublishesNothing() {
        let editor = makeFixture(longNote())
        editor.waitUntilReady()
        pumpFor(0.1)

        let origin = editor.scrollOffset
        let settled = editor.bridge.layoutTick

        editor.scrollView.contentView.scroll(to: NSPoint(x: 0, y: origin + 120))
        editor.scrollView.contentView.scroll(to: NSPoint(x: 0, y: origin))
        pumpFor(0.15)

        XCTAssertEqual(editor.scrollOffset, origin, accuracy: 0.5, "the fixture did not return to its offset")
        XCTAssertEqual(
            editor.bridge.layoutTick, settled,
            "a round trip back to the same geometry still published a tick"
        )
    }

    /// The guard above must not swallow the tick a newly planted editor needs.
    /// A fresh text view can read back the same offset and the same margin as
    /// the one it replaced while holding entirely different text, so `attach`
    /// forces its tick through unconditionally.
    func testAFreshlyAttachedEditorPublishesEvenWithUnchangedGeometry() {
        let editor = makeFixture(longNote())
        editor.waitUntilReady()
        pumpFor(0.1)

        let settled = editor.bridge.layoutTick
        editor.bridge.attach(textView: editor.textView, scrollView: editor.scrollView)

        XCTAssertEqual(editor.bridge.layoutTick, settled, "attach published on the caller's stack")
        XCTAssertTrue(
            pump(until: { editor.bridge.layoutTick > settled }),
            "attach did not re-anchor the rail against the new text"
        )
    }

    // MARK: Pushing text in reports the cursor once, off the update pass

    /// A held-open box so the test can push text in the way the app does when a
    /// suggestion is accepted or the selected note changes, and count what the
    /// editor reports back.
    private final class CursorSpy: ObservableObject {
        @Published var text: String
        @Published var cursor = 0
        /// Every `onCursorChange` the editor has made, in order.
        var reports: [Int] = []
        init(_ text: String) { self.text = text }
    }

    private struct SpyColumn: View {
        @ObservedObject var spy: CursorSpy
        let bridge: EditorBridge

        var body: some View {
            VStack {
                MarkdownEditor(
                    text: Binding(get: { spy.text }, set: { spy.text = $0 }),
                    contentInset: NSSize(width: 40, height: 64),
                    bridge: bridge,
                    onTextChange: {},
                    onCursorChange: { location in
                        spy.reports.append(location)
                        spy.cursor = location
                    }
                )
                // Something has to observe the cursor for SwiftUI to care about
                // the publish at all — in the app that is the Teleprompter body.
                Text("\(spy.cursor)").hidden()
            }
        }
    }

    /// Plants a `MarkdownEditor` whose cursor reports are counted, and hands back
    /// the spy plus the window keeping it alive.
    private func plantSpyEditor(_ text: String) -> (spy: CursorSpy, window: NSWindow, textView: KlartTextView) {
        bootstrapApp()
        let spy = CursorSpy(text)
        let size = EditorFixture.viewport
        let window = NSWindow(
            contentRect: NSRect(origin: .zero, size: size),
            styleMask: [.borderless],
            backing: .buffered,
            defer: false
        )
        let root = NSView(frame: NSRect(origin: .zero, size: size))
        window.contentView = root
        let hosting = NSHostingView(rootView: SpyColumn(spy: spy, bridge: EditorBridge()))
        hosting.frame = NSRect(origin: .zero, size: size)
        root.addSubview(hosting)
        window.makeKeyAndOrderFront(nil)
        window.layoutIfNeeded()

        guard let textView = firstDescendant(hosting, of: KlartTextView.self) else {
            fatalError("MarkdownEditor did not produce a KlartTextView")
        }
        return (spy, window, textView)
    }

    /// `makeNSView` assigns `string` with the delegate already live, from inside
    /// the update pass that is planting the view. The editor is rebuilt per note
    /// (`.id(selectedNoteID)`), so an unguarded report here is one illegal
    /// publish on every note switch.
    func testPlantingAnEditorReportsTheCursorAfterTheUpdatePass() {
        let planted = plantSpyEditor(longNote())
        // `layoutIfNeeded` above ran `makeNSView` to completion.
        XCTAssertEqual(
            planted.spy.reports, [],
            "planting reported the cursor from inside SwiftUI's update pass"
        )

        XCTAssertTrue(
            pump(until: { !planted.spy.reports.isEmpty }),
            "planting never reported a cursor, so the rail would anchor against the previous note"
        )
        XCTAssertEqual(planted.spy.reports.count, 1, "planting reported the cursor more than once")
        withExtendedLifetime(planted.window) {}
    }

    /// The push in `updateNSView` writes `string` and then the selection, and
    /// each of those re-enters the delegate — two synchronous reports per push
    /// before the guard. Afterwards: one report, and it carries the settled
    /// cursor rather than either intermediate value.
    func testAnExternalPushReportsTheSettledCursorExactlyOnce() {
        let planted = plantSpyEditor(longNote())
        XCTAssertTrue(pump(until: { planted.textView.textContainerInset.height > 100 }))
        XCTAssertTrue(pump(until: { !planted.spy.reports.isEmpty }))

        let middle = (planted.spy.text as NSString).length / 2
        planted.textView.setSelectedRange(NSRange(location: middle, length: 0))
        pumpFor(0.15)
        planted.spy.reports.removeAll()

        planted.spy.text = "# Replaced\n" + (1...80).map { "Replacement line \($0)." }.joined(separator: "\n")
        pumpFor(0.4)

        XCTAssertEqual(
            planted.spy.reports.count, 1,
            "the push reported the cursor \(planted.spy.reports.count) times: \(planted.spy.reports)"
        )
        XCTAssertEqual(
            planted.spy.reports.first, planted.textView.selectedRange().location,
            "the report did not carry the cursor the push settled on"
        )
        withExtendedLifetime(planted.window) {}
    }
}
#endif
