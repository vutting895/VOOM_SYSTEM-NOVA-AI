from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]


class ComposeContractTests(unittest.TestCase):
    def test_compose_does_not_publish_any_host_ports(self):
        source = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
        self.assertNotRegex(source, r"(?m)^\s+ports\s*:")
        self.assertIn("mt5_internal:", source)
        self.assertIn("internal: true", source)
        self.assertIn("no-new-privileges:true", source)
        self.assertIn("read_only: true", source)

    def test_upstream_engine_image_is_digest_pinned_and_uses_its_entrypoint(self):
        source = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
        self.assertIn(
            "lprett/mt5linux@sha256:40480bc9d52eb24496f37131d3cf9162fead58ff3bceee0a102d956a129612d9",
            source,
        )
        self.assertIn('exec ./start.sh >/dev/null 2>&1', source)
        self.assertNotIn("/app/src/main.sh", source)
        self.assertIn('export LOGIN="$(cat /run/secrets/mt5_login)"', source)
        self.assertIn('export PASSWORD="$(cat /run/secrets/mt5_password)"', source)
        self.assertIn('export SERVER="$(cat /run/secrets/mt5_server)"', source)

    def test_runtime_secrets_are_file_mounted_not_inline(self):
        source = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
        for secret in (
            "mt5_login", "mt5_password", "mt5_server", "vnc_password",
            "mt5_tenant_id", "mt5_bridge_token",
        ):
            with self.subTest(secret=secret):
                self.assertIn(f"{secret}:\n    file: ./secrets/", source)
        self.assertNotRegex(source, r"(?m)^\s+MT5_PASSWORD:\s*[^\n]+$")
        self.assertNotRegex(source, r"(?m)^\s+MT5_LOGIN:\s*[^\n]+$")

    def test_gitignore_excludes_secret_files(self):
        ignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
        self.assertIn("secrets/*", ignore)
        self.assertIn("!secrets/.gitkeep", ignore)


if __name__ == "__main__":
    unittest.main(verbosity=2)
