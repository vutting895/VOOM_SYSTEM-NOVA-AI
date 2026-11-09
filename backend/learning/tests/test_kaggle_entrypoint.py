"""Regression tests for the Kaggle runner's explicit dataset-manifest allowlist."""
from pathlib import Path

SCRIPT = (
    Path(__file__).resolve().parents[3]
    / "kaggle"
    / "nova-auto-learning"
    / "main.py"
)


def load_entrypoint_namespace():
    source = SCRIPT.read_text(encoding="utf-8")
    namespace = {"__name__": "nova_kaggle_entrypoint_test"}
    exec(compile(source, str(SCRIPT), "exec"), namespace)
    return namespace


def test_kaggle_entrypoint_resolves_each_supported_dataset_manifest():
    resolve = load_entrypoint_namespace()["resolve_dataset_manifest"]
    checkout = Path("/tmp/nova-checkout")

    expected = {
        "exness_xauusdm_m15": "datasets/exness/demo/xauusdm_m15/dataset_manifest.json",
        "exness_xauusdm_h1_3y": "data/market/exness/XAUUSDm_H1_3Y.manifest.json",
        "binance_btcusdt_h1_5y": "datasets/public/binance/btcusdt_h1/dataset_manifest.json",
        "binance_btcusdt_h1_500": "datasets/public/binance/btcusdt_h1/dataset_manifest.json",
    }

    for dataset_id, relative_path in expected.items():
        assert resolve(checkout, dataset_id) == checkout / relative_path


def test_kaggle_entrypoint_rejects_unknown_dataset_ids():
    resolve = load_entrypoint_namespace()["resolve_dataset_manifest"]
    try:
        resolve(Path("/tmp/nova-checkout"), "../untrusted/path")
    except ValueError as exc:
        assert "Unsupported NOVA_DATASET_ID" in str(exc)
    else:
        raise AssertionError("Unknown dataset IDs must fail closed.")


def test_dataset_manifest_paths_are_repository_relative():
    namespace = load_entrypoint_namespace()
    for relative_path in namespace["DATASET_MANIFESTS"].values():
        assert not Path(relative_path).is_absolute()
        assert ".." not in Path(relative_path).parts


def test_kaggle_training_requires_h1_and_sha_bound_human_approval():
    source = SCRIPT.read_text(encoding="utf-8")
    assert 'secret("NOVA_TRAINING_APPROVED")' in source
    assert 'secret("NOVA_APPROVED_DATASET_SHA256")' in source
    assert 'secret("NOVA_APPROVED_CODE_SHA")' in source
    assert 'dataset_id != "exness_xauusdm_h1_3y"' in source
    assert '"--training-approved"' in source
    assert '"--approved-dataset-sha256"' in source
    assert '"--approved-code-sha"' in source
    assert 'or "exness_xauusdm_m15"' not in source
    assert '"--upload-to-hf"' not in source
