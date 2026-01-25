/**
 * Creates Linear tickets from security scan results
 */

const fs = require('fs');
const crypto = require('crypto');

const LINEAR_API_URL = 'https://api.linear.app/graphql';
const LINEAR_API_KEY = process.env.LINEAR_API_KEY;
const LINEAR_TEAM_ID = process.env.LINEAR_TEAM_ID;
const LINEAR_SECURITY_LABEL_ID = process.env.LINEAR_SECURITY_LABEL_ID;
const GITHUB_REPO = process.env.GITHUB_REPOSITORY;
const GITHUB_SHA = process.env.GITHUB_SHA?.substring(0, 7);
const GITHUB_REF = process.env.GITHUB_REF;

const PRIORITY_MAP = {
  'CRITICAL': 0,
  'HIGH': 1,
  'MEDIUM': 2,
  'LOW': 3
};

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

async function ticketExists(vulnHash) {
  const query = `
    query SearchIssues($filter: IssueFilter!) {
      issues(filter: $filter) {
        nodes {
          id
          identifier
          title
        }
      }
    }
  `;

  try {
    const data = await linearRequest(query, {
      filter: {
        team: { id: { eq: LINEAR_TEAM_ID } },
        labels: { id: { eq: LINEAR_SECURITY_LABEL_ID } },
        title: { containsIgnoreCase: vulnHash }
      }
    });

    return data.issues.nodes.length > 0;
  } catch (error) {
    console.log('Could not check for duplicates:', error.message);
    return false;
  }
}

async function createLinearTicket(vuln) {
  const vulnHash = generateVulnHash(vuln);
  
  if (await ticketExists(vulnHash)) {
    console.log(`⏭️  Skipping duplicate: ${vuln.title.substring(0, 60)}... [${vulnHash}]`);
    return null;
  }

  const mutation = `
    mutation CreateIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id
          identifier
          url
        }
      }
    }
  `;

  const description = `## 🔒 Security Vulnerability

**Hash:** \`${vulnHash}\`
**Severity:** ${vuln.severity}
**File:** \`${vuln.file}\`${vuln.line ? `
**Line:** ${vuln.line}` : ''}
**Rule:** ${vuln.ruleId}
**Scanner:** ${vuln.scanner}

### Description
${vuln.description}

${vuln.cwe ? `### CWE Reference
${vuln.cwe}
` : ''}${vuln.recommendation ? `### Recommendation
${vuln.recommendation}
` : ''}
### Remediation Checklist
- [ ] Analyze vulnerability in context
- [ ] Review security best practices for this issue type
- [ ] Use Claude Code to implement fix
- [ ] Add test case to prevent regression
- [ ] Create PR with fix
- [ ] Request security review

### Source
- **Repository:** ${GITHUB_REPO}
- **Commit:** ${GITHUB_SHA}
- **Branch:** ${GITHUB_REF?.replace('refs/heads/', '')}
- **Scan date:** ${new Date().toISOString().split('T')[0]}

---
*Auto-generated from GitHub Actions security scan*
`;

  try {
    const data = await linearRequest(mutation, {
      input: {
        teamId: LINEAR_TEAM_ID,
        title: `🔒 [${vuln.severity}] ${vuln.title.substring(0, 80)} [${vulnHash}]`,
        description: description,
        priority: PRIORITY_MAP[vuln.severity] || 2,
        labelIds: [LINEAR_SECURITY_LABEL_ID]
      }
    });

    if (data.issueCreate.success) {
      const issue = data.issueCreate.issue;
      console.log(`✅ Created: ${issue.identifier} - ${vuln.title.substring(0, 60)}...`);
      return issue;
    }
  } catch (error) {
    console.error(`❌ Failed to create ticket for: ${vuln.title}`, error.message);
    return null;
  }

  await new Promise(resolve => setTimeout(resolve, 500));
}

function parseTrivyResults() {
  const vulnerabilities = [];
  
  try {
    const trivyData = JSON.parse(fs.readFileSync('trivy-results.json', 'utf8'));
    
    for (const result of trivyData.Results || []) {
      const target = result.Target || 'unknown';
      
      for (const vuln of result.Vulnerabilities || []) {
        vulnerabilities.push({
          scanner: 'Trivy',
          title: `${vuln.PkgName}: ${vuln.VulnerabilityID}`,
          description: vuln.Description || vuln.Title || 'No description available',
          severity: vuln.Severity,
          file: target,
          ruleId: vuln.VulnerabilityID,
          cwe: vuln.CweIDs?.join(', '),
          recommendation: vuln.FixedVersion ? `Update to version ${vuln.FixedVersion}` : 'No fix available yet'
        });
      }
    }
  } catch (error) {
    console.log('ℹ️  No Trivy results found or error parsing:', error.message);
  }
  
  return vulnerabilities;
}

function parseSemgrepResults() {
  const vulnerabilities = [];
  
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
          
          vulnerabilities.push({
            scanner: 'Semgrep',
            title: result.message.text.substring(0, 100),
            description: result.message.text,
            severity: severity,
            file: location?.artifactLocation?.uri || 'unknown',
            line: location?.region?.startLine,
            ruleId: result.ruleId,
            recommendation: result.message.markdown || 'Review code for security best practices'
          });
        }
      }
    }
  } catch (error) {
    console.log('ℹ️  No Semgrep results found or error parsing:', error.message);
  }
  
  return vulnerabilities;
}

async function main() {
  if (!LINEAR_API_KEY || !LINEAR_TEAM_ID || !LINEAR_SECURITY_LABEL_ID) {
    console.log('⚠️  Linear credentials not configured. Skipping ticket creation.');
    console.log('Please configure: LINEAR_API_KEY, LINEAR_TEAM_ID, LINEAR_SECURITY_LABEL_ID');
    return;
  }

  console.log('🔍 Parsing security scan results...');
  
  const trivyVulns = parseTrivyResults();
  const semgrepVulns = parseSemgrepResults();
  
  const allVulns = [...trivyVulns, ...semgrepVulns];
  
  console.log(`\n📊 Found ${allVulns.length} total findings:`);
  console.log(`   - Trivy: ${trivyVulns.length}`);
  console.log(`   - Semgrep: ${semgrepVulns.length}`);
  
  if (allVulns.length === 0) {
    console.log('\n✅ No security vulnerabilities found!');
    return;
  }

  const criticalVulns = allVulns.filter(v => 
    v.severity === 'CRITICAL' || v.severity === 'HIGH'
  );
  
  console.log(`\n🎯 Creating tickets for ${criticalVulns.length} CRITICAL/HIGH severity issues...\n`);
  
  let created = 0;
  let skipped = 0;
  
  for (const vuln of criticalVulns) {
    const result = await createLinearTicket(vuln);
    if (result) {
      created++;
    } else {
      skipped++;
    }
  }
  
  console.log(`\n📋 Summary:`);
  console.log(`   ✅ Created: ${created} tickets`);
  console.log(`   ⏭️  Skipped: ${skipped} (duplicates)`);
  console.log(`\n🔗 View tickets in Linear: https://linear.app`);
  
  fs.writeFileSync('linear-tickets-summary.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    total_findings: allVulns.length,
    critical_high: criticalVulns.length,
    tickets_created: created,
    tickets_skipped: skipped
  }, null, 2));
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});