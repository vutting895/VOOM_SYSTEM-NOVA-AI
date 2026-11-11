import unittest
from workers.quant_engine.vision import VisionTrainingError,build_chart_mae

class VisionMAEContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        try: import torch
        except ImportError: raise unittest.SkipTest("PyTorch optional")
        cls.torch=torch
    def test_masked_patch_reconstruction(self):
        model=build_chart_mae(image_size=32,patch_size=8,embed_dim=32,encoder_depth=1,decoder_depth=1,num_heads=4)
        x=self.torch.rand(2,3,32,32)
        out=model(x,mask_ratio=.5,generator=self.torch.Generator().manual_seed(7))
        self.assertEqual(tuple(out["prediction"].shape),(2,16,192))
        self.assertTrue(self.torch.isfinite(out["loss"]))
        self.assertTrue(self.torch.all(out["mask"].sum(1)==8))
    def test_invalid_shape_rejected(self):
        model=build_chart_mae(image_size=32,patch_size=8,embed_dim=32,encoder_depth=1,decoder_depth=1,num_heads=4)
        with self.assertRaises(VisionTrainingError): model(self.torch.rand(2,3,32,31))
    def test_training_writes_checksummed_checkpoint(self):
        model = build_chart_mae(image_size=16, patch_size=8, embed_dim=16,
                                encoder_depth=1, decoder_depth=1, num_heads=4)
        from workers.quant_engine.vision import train_chart_mae
        images = self.torch.rand(4, 3, 16, 16).tolist()
        result = train_chart_mae(
            model, images[:3], images[3:],
            model_version="vision-mae-test-v1", dataset_sha256="a"*64,
            feature_schema_sha256="b"*64, epochs=2, batch_size=2, patience=1,
            seed=7, device="cpu",
        )
        import hashlib
        self.assertEqual(result.checkpoint_sha256, hashlib.sha256(result.checkpoint_bytes).hexdigest())
        self.assertGreaterEqual(result.best_epoch, 1)
        self.assertTrue(self.torch.isfinite(self.torch.tensor(result.best_validation_loss)))

    def test_invalid_architecture_rejected(self):
        with self.assertRaises(VisionTrainingError): build_chart_mae(image_size=30,patch_size=8)
if __name__=="__main__": unittest.main(verbosity=2)
