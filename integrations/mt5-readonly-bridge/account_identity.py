"""Pure account-identity checks shared by the Windows Bridge and its unit tests."""
import hmac
import re


def matches_expected_identity(actual_login, actual_server, expected_login, expected_server):
    if (
        not isinstance(expected_login, str)
        or not re.fullmatch(r"[1-9][0-9]{0,19}", expected_login)
        or not isinstance(expected_server, str)
        or not expected_server
        or expected_server != expected_server.strip()
    ):
        return False

    login = str(actual_login or "")
    server = str(actual_server or "")
    return (
        hmac.compare_digest(login, expected_login)
        and hmac.compare_digest(server, expected_server)
    )
