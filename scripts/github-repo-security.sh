#!/usr/bin/env bash
#
# Applies the repository's security settings through the GitHub API, so they're recorded
# in the repo rather than living only as clicks someone made in a browser once.
#
# Requires the GitHub CLI, authenticated as a user with admin rights on the repo:
#
#   gh auth login          # once, interactive
#   ./scripts/github-repo-security.sh
#
# Safe to re-run — every call is idempotent.
#
# Deliberately NOT enabled here: required pull requests and required status checks on
# main. Both block *direct pushes* to a protected branch, and this project is developed
# solo across two machines that push straight to main. The protection below stops the
# thing that would actually hurt — history being destroyed — without adding friction to
# the normal workflow. If the project ever takes outside contributions, revisit: at that
# point requiring a PR is the right call, not least because CONTRIBUTING.md's inbound
# licence terms need a place to be agreed to.

set -euo pipefail

REPO="${1:-Catalyst4K/flightdeck}"

echo "Applying security settings to $REPO"
echo

# --- Dependabot -------------------------------------------------------------------------
# Alerts for known vulnerabilities in dependencies, and automatic PRs to fix them.
# The update *schedule* lives in .github/dependabot.yml; these two switches are the
# security half, which is API-only.
echo "· Dependabot vulnerability alerts"
gh api -X PUT "repos/$REPO/vulnerability-alerts" --silent

echo "· Dependabot automated security fixes"
gh api -X PUT "repos/$REPO/automated-security-fixes" --silent

# --- Secret scanning --------------------------------------------------------------------
# Push protection is the valuable half: it rejects a push containing a recognised
# credential before it ever reaches GitHub, rather than telling you afterwards. Both are
# free for public repositories.
# Note: these calls send their body via `--input -`. gh's `--raw-field` sends the value as
# a plain string, which the API rejects for nested objects and for a literal null — the
# first version of this script got a 422 that way.
#
# `secret_scanning` is already on by default for public repos; push protection is not, and
# it's the half that matters. Not enabled here: `secret_scanning_non_provider_patterns`,
# which catches generic high-entropy strings as well as recognised provider formats. It
# would plausibly catch a SimBrief or Navigraph credential that no provider pattern knows
# about, but it also false-positives on things this repo legitimately contains (base64
# blobs, hex identifiers), and a false positive in *push protection* blocks a real push.
# Worth revisiting if a credential ever does slip through.
echo "· Secret scanning + push protection"
gh api -X PATCH "repos/$REPO" --silent --input - <<'JSON'
{
  "security_and_analysis": {
    "secret_scanning": { "status": "enabled" },
    "secret_scanning_push_protection": { "status": "enabled" }
  }
}
JSON

# --- Private vulnerability reporting ----------------------------------------------------
# Gives people a private channel to report a vulnerability, instead of the only option
# being a public issue. Pairs with SECURITY.md, which points at it.
echo "· Private vulnerability reporting"
gh api -X PUT "repos/$REPO/private-vulnerability-reporting" --silent

# --- Branch protection on main ----------------------------------------------------------
# No force pushes, no branch deletion. enforce_admins stays false so the owner keeps an
# escape hatch; the point is to prevent an accident, not to lock anyone out.
echo "· Branch protection on main (block force-push and deletion)"
gh api -X PUT "repos/$REPO/branches/main/protection" --silent --input - <<'JSON'
{
  "required_status_checks": null,
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON

# --- Housekeeping -----------------------------------------------------------------------
echo "· Delete head branches after merge"
gh api -X PATCH "repos/$REPO" --silent --input - <<'JSON'
{ "delete_branch_on_merge": true }
JSON

echo
echo "Done. Current state:"
gh api "repos/$REPO" \
  --jq '"  visibility:        \(.visibility)
  licence:           \(.license.spdx_id // "none")
  forks:             \(.forks_count)
  delete on merge:   \(.delete_branch_on_merge)
  secret scanning:   \(.security_and_analysis.secret_scanning.status)
  push protection:   \(.security_and_analysis.secret_scanning_push_protection.status)"'
gh api "repos/$REPO/branches/main/protection" \
  --jq '"  force pushes:      \(.allow_force_pushes.enabled)
  deletions:         \(.allow_deletions.enabled)"'
