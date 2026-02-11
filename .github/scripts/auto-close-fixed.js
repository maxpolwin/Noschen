/**
 * Auto-close Linear tickets for vulnerabilities that are no longer detected.
 * Counterpart to create-linear-tickets.js which opens them.
 */

const fs = require('fs');
const crypto = require('crypto');

const LINEAR_API_URL = 'https://api.linear.app/graphql';
const LINEAR_API_KEY = process.env.LINEAR_API_KEY;
const LINEAR_TEAM_ID = process.env.LINEAR_TEAM_ID;

async function linearRequest(query, variables = {}) {
  const response = await fetch(LINEAR_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': LINEAR_API_KEY
    },
    body: JSON.stringify({ query, variables })
  });

  const data = await response.json();

  if (data.errors) {
    console.error('Linear API errors:', JSON.stringify(data.errors, null, 2));
    throw new Error(`Linear API error: ${data.errors[0].message}`);
  }

  return data.data;
}

function generateVulnHash(vuln) {
  const key = `${vuln.ruleId}-${vuln.file}-${vuln.severity}`;
  return crypto.createHash('md5').update(key).digest('hex').substring(0, 8);
}

function parseCurrentVulnHashes() {
  const hashes = new Set();

  // Parse Trivy results
  try {
    const trivyData = JSON.parse(fs.readFileSync('trivy-results.json', 'utf8'));
    for (const result of trivyData.Results || []) {
      const target = result.Target || 'unknown';
      for (const vuln of result.Vulnerabilities || []) {
        hashes.add(generateVulnHash({
          ruleId: vuln.VulnerabilityID,
          file: target,
          severity: vuln.Severity
        }));
      }
    }
  } catch (error) {
    console.log('No Trivy results found:', error.message);
  }

  // Parse Semgrep results
  try {
    const semgrepFiles = fs.readdirSync('.').filter(f =>
      f.startsWith('semgrep') && f.endsWith('.sarif')
    );
    for (const file of semgrepFiles) {
      const sarifData = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const run of sarifData.runs || []) {
        for (const result of run.results || []) {
          const location = result.locations?.[0]?.physicalLocation;
          const severity = result.level === 'error' ? 'HIGH' :
                          result.level === 'warning' ? 'MEDIUM' : 'LOW';
          hashes.add(generateVulnHash({
            ruleId: result.ruleId,
            file: location?.artifactLocation?.uri || 'unknown',
            severity: severity
          }));
        }
      }
    }
  } catch (error) {
    console.log('No Semgrep results found:', error.message);
  }

  return hashes;
}

async function getOpenSecurityTickets() {
  const query = `
    query OpenSecurityIssues($filter: IssueFilter!) {
      issues(filter: $filter) {
        nodes {
          id
          identifier
          title
          state {
            name
            type
          }
        }
      }
    }
  `;

  const data = await linearRequest(query, {
    filter: {
      team: { id: { eq: LINEAR_TEAM_ID } },
      state: { type: { nin: ["completed", "canceled"] } },
      title: { containsIgnoreCase: "[" }
    }
  });

  return data.issues.nodes;
}

function extractHashFromTitle(title) {
  const match = title.match(/\[([a-f0-9]{8})\]\s*$/);
  return match ? match[1] : null;
}

async function closeTicket(issue) {
  // Get the "Done" state for the team
  const statesQuery = `
    query TeamStates($teamId: String!) {
      team(id: $teamId) {
        states {
          nodes {
            id
            name
            type
          }
        }
      }
    }
  `;

  const statesData = await linearRequest(statesQuery, { teamId: LINEAR_TEAM_ID });
  const doneState = statesData.team.states.nodes.find(s => s.type === 'completed');

  if (!doneState) {
    console.log(`  Could not find a completed state for team, skipping ${issue.identifier}`);
    return false;
  }

  // Add a comment explaining the closure
  const commentMutation = `
    mutation AddComment($input: CommentCreateInput!) {
      commentCreate(input: $input) {
        success
      }
    }
  `;

  await linearRequest(commentMutation, {
    input: {
      issueId: issue.id,
      body: `This vulnerability is no longer detected in the latest security scan. Auto-closing.\n\n*Closed by GitHub Actions security scan on ${new Date().toISOString().split('T')[0]}*`
    }
  });

  // Close the ticket
  const updateMutation = `
    mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) {
        success
      }
    }
  `;

  const result = await linearRequest(updateMutation, {
    id: issue.id,
    input: { stateId: doneState.id }
  });

  return result.issueUpdate.success;
}

async function main() {
  if (!LINEAR_API_KEY || !LINEAR_TEAM_ID) {
    console.log('Linear credentials not configured. Skipping auto-close.');
    return;
  }

  console.log('Parsing current scan results for active vulnerabilities...');
  const activeHashes = parseCurrentVulnHashes();
  console.log(`Found ${activeHashes.size} active vulnerability hashes.\n`);

  console.log('Fetching open security tickets from Linear...');
  let tickets;
  try {
    tickets = await getOpenSecurityTickets();
  } catch (error) {
    console.error('Failed to fetch tickets:', error.message);
    return;
  }

  const securityTickets = tickets.filter(t => extractHashFromTitle(t.title));
  console.log(`Found ${securityTickets.length} open security tickets.\n`);

  let closed = 0;
  let kept = 0;

  for (const ticket of securityTickets) {
    const hash = extractHashFromTitle(ticket.title);
    if (activeHashes.has(hash)) {
      kept++;
      continue;
    }

    console.log(`Closing ${ticket.identifier}: ${ticket.title.substring(0, 60)}...`);
    try {
      const success = await closeTicket(ticket);
      if (success) closed++;
    } catch (error) {
      console.error(`  Failed to close ${ticket.identifier}:`, error.message);
    }

    // Rate limit
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`\nSummary:`);
  console.log(`  Closed: ${closed} resolved tickets`);
  console.log(`  Kept open: ${kept} still-active tickets`);
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
