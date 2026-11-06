"""Offline CLI checks for the two Bash validation helpers."""

import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
BASH = r"C:\Program Files\Git\bin\bash.exe" if os.name == "nt" else "bash"
SHA = "a" * 40


class ValidationScriptsTest(unittest.TestCase):
    def run_script(self, script, *args, scenario="none", missing_dependencies=False):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            mock = Path(directory) / "gh"
            mock.write_text("""#!/usr/bin/env bash
case "$*" in
  'api repos/maxsail-project/tackbar/branches/main --jq .commit.sha'|'api repos/maxsail-project/tackbar/commits/abc --jq .sha') echo '@SHA@' ;;
  'api user --jq .login') echo mock-user ;;
  *'actions/runs?head_sha='*)
    case "$MOCK_SCENARIO" in
      malformed) echo '{}' ;;
      none) echo '{"workflow_runs":[]}' ;;
      incomplete) echo '{"workflow_runs":[{"id":1,"name":"Validate Frontend (Linux)","head_sha":"@SHA@","status":"queued","created_at":"2026-01-01","html_url":"https://example.test/front"}]}' ;;
      failed) echo '{"workflow_runs":[{"id":1,"name":"Validate Frontend (Linux)","head_sha":"@SHA@","status":"completed","conclusion":"failure","created_at":"2026-01-01","html_url":"https://example.test/front"}]}' ;;
      *) echo '{"workflow_runs":[{"id":1,"name":"Validate Frontend (Linux)","head_sha":"@SHA@","status":"completed","conclusion":"success","created_at":"2026-01-01","html_url":"https://example.test/front"},{"id":2,"name":"Validate Backend (Linux)","head_sha":"@SHA@","status":"completed","conclusion":"success","created_at":"2026-01-01","html_url":"https://example.test/back"}]}' ;;
    esac ;;
  *'actions/runs/1/jobs?'*) echo '{"jobs":[{"id":11,"name":"Frontend tests","steps":[{"name":"Typecheck frontend","conclusion":"success"},{"name":"Build production frontend","conclusion":"success"}]}]}' ;;
  *'actions/runs/2/jobs?'*) echo '{"jobs":[{"id":22,"name":"Full backend regression"}]}' ;;
  *'actions/jobs/11/logs'*) [[ "$MOCK_SCENARIO" == missing_log ]] && exit 1; printf '\\033[32mTests  9 passed | 1 skipped (10)\\033[0m\\r\\n' ;;
  *'actions/jobs/22/logs'*) echo '8 passed, 1 failed, 1 error, 2 errors, 3 skipped in 1.2s' ;;
  *'run list'*)
    state="$MOCK_STATE"
    [[ "$*" == *validate-frontend-linux.yml* ]] && state="${state}-front"
    count=$(cat "$state" 2>/dev/null || echo 0)
    count=$((count+1)); echo "$count" > "$state"
    case "$MOCK_SCENARIO" in
      ambiguous) [[ $count -eq 1 ]] && echo '[]' || echo '[{"databaseId":3,"headSha":"@SHA@","url":"https://example.test/3"},{"databaseId":4,"headSha":"@SHA@","url":"https://example.test/4"}]' ;;
      mismatch) [[ $count -eq 1 ]] && echo '[]' || echo '[{"databaseId":3,"headSha":"@OTHER@","url":"https://example.test/3"}]' ;;
      *) [[ $count -eq 1 ]] && echo '[]' || echo '[{"databaseId":3,"headSha":"@SHA@","url":"https://example.test/3"}]' ;;
    esac ;;
  'workflow run '*) echo dispatch >> "$MOCK_DISPATCH" ;;
  'run watch '*) [[ "$MOCK_SCENARIO" != watch_failure ]] ;;
  'run view '*) [[ "$MOCK_SCENARIO" == missing_log ]] && exit 1; if [[ "$MOCK_SCENARIO" == workflow_failure ]]; then echo '{"status":"completed","conclusion":"failure","headSha":"@SHA@","url":"https://example.test/3"}'; else echo '{"status":"completed","conclusion":"success","headSha":"@SHA@","url":"https://example.test/3"}'; fi ;;
  *) echo "Unexpected gh call: $*" >&2; exit 9 ;;
esac
""".replace("@SHA@", SHA).replace("@OTHER@", "b" * 40), encoding="utf-8")
            state = Path(directory) / "state"
            dispatch = Path(directory) / "dispatch"
            path = str(directory) if missing_dependencies else str(directory) + os.pathsep + os.environ["PATH"]
            env = dict(os.environ, PATH=path,
                       MOCK_SCENARIO=scenario, MOCK_STATE=str(state), MOCK_DISPATCH=str(dispatch))
            result = subprocess.run([BASH, str(ROOT / "scripts" / script), *args],
                                    capture_output=True, text=True, env=env, timeout=40)
            return result, dispatch.read_text().splitlines() if dispatch.exists() else []

    def test_help_and_invalid_args(self):
        for script in ("get-validation.sh", "validate-tackbar.sh"):
            for flag in ("--help", "-h"):
                result, calls = self.run_script(script, flag)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn("Dependencies", result.stdout)
                self.assertEqual(calls, [])
            result, _ = self.run_script(script, "--bogus")
            self.assertEqual(result.returncode, 2)

    def test_read_only_and_counts(self):
        result, calls = self.run_script("get-validation.sh", "--json", scenario="none")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual([r["Status"] for r in json.loads(result.stdout)["Results"]], ["NOT RUN"] * 2)
        self.assertEqual(calls, [])
        result, calls = self.run_script("get-validation.sh", "-s", "abc", "--json", scenario="success")
        self.assertEqual(result.returncode, 0, result.stderr)
        output = json.loads(result.stdout)
        self.assertEqual(output["SHA"], SHA)
        self.assertEqual(output["Results"][0]["Passed"], 9)
        self.assertEqual(output["Results"][0]["Typecheck"], "success")
        self.assertEqual(output["Results"][1]["Failed"], 4)
        self.assertEqual(calls, [])

    def test_bad_json(self):
        result, _ = self.run_script("get-validation.sh", "--json", scenario="malformed")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Invalid workflows JSON", result.stderr)

    def test_missing_dependency(self):
        for script, args in (("get-validation.sh", ()), ("validate-tackbar.sh", ("frontend",))):
            result, calls = self.run_script(script, *args, missing_dependencies=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Missing dependency: jq", result.stderr)
            self.assertEqual(calls, [])

    def test_incomplete_failed_and_missing_log(self):
        for scenario, status in (("incomplete", "queued"), ("failed", "failure")):
            result, calls = self.run_script("get-validation.sh", "--json", scenario=scenario)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(json.loads(result.stdout)["Results"][0]["Status"], status)
            self.assertEqual(calls, [])
        result, _ = self.run_script("get-validation.sh", "--json", scenario="missing_log")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIsNone(json.loads(result.stdout)["Results"][0]["Passed"])
        self.assertIn("No se pudo leer el log", result.stdout)

    def test_dispatch_safety(self):
        for scenario, expected in (("ambiguous", "More than one"), ("mismatch", "Run SHA differs"),
                                   ("watch_failure", ""), ("workflow_failure", "Conclusion: failure")):
            result, calls = self.run_script("validate-tackbar.sh", "frontend", "-w", scenario=scenario)
            self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual(calls, ["dispatch"])
            self.assertIn(expected, result.stdout + result.stderr)

    def test_both_dispatch_once_each(self):
        result, calls = self.run_script("validate-tackbar.sh", "both")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(calls, ["dispatch", "dispatch"])


if __name__ == "__main__":
    unittest.main()
