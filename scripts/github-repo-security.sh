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
echo "· Secret scanning + push protection"
gh api -X PATCH "repos/$REPO" --silent \
  --raw-field 'security_and_analysis={
    "secret_scanning": { "status": "enabled" },
    "secret_scanning_push_protection": { "status": "enabled" }
  }'

# --- Private vulnerability reporting ----------------------------------------------------
# Gives people a private channel to report a vulnerability, instead of the only option
# being a public issue. Pairs with SECURITY.md, which points at it.
echo "· Private vulnerability reporting"
gh api -X PUT "repos/$REPO/private-vulnerability-reporting" --silent

# --- Branch protection on main ----------------------------------------------------------
# No force pushes, no branch deletion. enforce_admins stays false so the owner keeps an
# escape hatch; the point is to prevent an accident, not to lock anyone out.
echo "· Branch protection on main (block force-push and deletion)"
gh api -X PUT "repos/$REPO/branches/main/protection" --silent \
  --raw-field 'required_status_checks=null' \
  --raw-field 'enforce_admins=false' \
  --raw-field 'required_pull_request_reviews=null' \
  --raw-field 'restrictions=null' \
  --raw-field 'allow_force_pushes=false' \
  --raw-field 'allow_deletions=false'

# --- Housekeeping -----------------------------------------------------------------------
echo "· Delete head branches after merge"
gh api -X PATCH "repos/$REPO" --silent --field 'delete_branch_on_merge=true'

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
