"""Leakage-aware Masked Autoencoder for causal market-chart images."""
from __future__ import annotations
from dataclasses import dataclass
from hashlib import sha256
from io import BytesIO
import math, random, re
from typing import Sequence

class VisionTrainingError(ValueError):
    pass

@dataclass(frozen=True)
class VisionTrainingResult:
    checkpoint_bytes: bytes
    checkpoint_sha256: str
    model_version: str
    best_epoch: int
    epochs_completed: int
    best_validation_loss: float
    seed: int

def build_chart_mae(*, image_size=128, patch_size=16, embed_dim=96,
                    encoder_depth=3, decoder_depth=2, num_heads=4, dropout=0.1):
    try:
        import torch
        from torch import nn
    except ImportError as exc:
        raise RuntimeError("PyTorch is required for the chart MAE") from exc
    for name,value in (("image_size",image_size),("patch_size",patch_size),("embed_dim",embed_dim),
                       ("encoder_depth",encoder_depth),("decoder_depth",decoder_depth),("num_heads",num_heads)):
        if isinstance(value,bool) or not isinstance(value,int) or value<=0:
            raise VisionTrainingError(f"{name} must be a positive integer")
    if image_size%patch_size or embed_dim%num_heads:
        raise VisionTrainingError("image_size must divide by patch_size and embed_dim by num_heads")
    if isinstance(dropout,bool) or not isinstance(dropout,(int,float)) or not math.isfinite(float(dropout)) or not 0<=dropout<1:
        raise VisionTrainingError("dropout must be finite and in [0, 1)")
    class ChartMAE(nn.Module):
        def __init__(self):
            super().__init__()
            self.image_size=image_size; self.patch_size=patch_size
            self.patch_count=(image_size//patch_size)**2
            self.patch_embed=nn.Conv2d(3,embed_dim,kernel_size=patch_size,stride=patch_size)
            self.position=nn.Parameter(torch.zeros(1,self.patch_count,embed_dim))
            nn.init.trunc_normal_(self.position,std=.02)
            enc=nn.TransformerEncoderLayer(d_model=embed_dim,nhead=num_heads,dim_feedforward=embed_dim*4,
                dropout=dropout,batch_first=True,norm_first=True,activation="gelu")
            dec=nn.TransformerEncoderLayer(d_model=embed_dim,nhead=num_heads,dim_feedforward=embed_dim*4,
                dropout=dropout,batch_first=True,norm_first=True,activation="gelu")
            self.encoder=nn.TransformerEncoder(enc,num_layers=encoder_depth)
            self.decoder_embed=nn.Linear(embed_dim,embed_dim)
            self.mask_token=nn.Parameter(torch.zeros(1,1,embed_dim))
            self.decoder=nn.TransformerEncoder(dec,num_layers=decoder_depth)
            self.decoder_norm=nn.LayerNorm(embed_dim)
            self.predict=nn.Linear(embed_dim,patch_size*patch_size*3)
        def patchify(self,images):
            p=self.patch_size; b,c,h,w=images.shape
            return images.reshape(b,c,h//p,p,w//p,p).permute(0,2,4,3,5,1).reshape(b,-1,p*p*c)
        def forward(self,images,*,mask_ratio=.5,generator=None):
            if images.ndim!=4 or tuple(images.shape[1:])!=(3,image_size,image_size):
                raise VisionTrainingError("images must have shape [batch, 3, image_size, image_size]")
            if not 0<mask_ratio<1: raise VisionTrainingError("mask_ratio must be strictly between 0 and 1")
            targets=self.patchify(images)
            embedded=self.patch_embed(images).flatten(2).transpose(1,2)+self.position
            batch,count,width=embedded.shape
            keep=max(1,min(count-1,int(count*(1-mask_ratio))))
            noise=torch.rand(batch,count,device=images.device,generator=generator)
            shuffled=torch.argsort(noise,dim=1); restore=torch.argsort(shuffled,dim=1)
            ids=shuffled[:,:keep]
            visible=torch.gather(embedded,1,ids.unsqueeze(-1).expand(-1,-1,width))
            encoded=self.encoder(visible)
            masked=self.mask_token.expand(batch,count-keep,-1)
            shuffled_tokens=torch.cat((self.decoder_embed(encoded),masked),dim=1)
            full=torch.gather(shuffled_tokens,1,restore.unsqueeze(-1).expand(-1,-1,width))+self.position
            prediction=self.predict(self.decoder_norm(self.decoder(full)))
            mask=torch.ones(batch,count,device=images.device); mask[:,:keep]=0
            mask=torch.gather(mask,1,restore)
            per_patch=(prediction-targets).pow(2).mean(dim=-1)
            loss=(per_patch*mask).sum()/mask.sum().clamp_min(1)
            return {"loss":loss,"prediction":prediction,"mask":mask}
    return ChartMAE()

def train_chart_mae(model,train_images:Sequence,validation_images:Sequence,*,
    model_version,dataset_sha256,feature_schema_sha256,epochs=80,batch_size=32,
    patience=10,learning_rate=.0003,weight_decay=.0001,mask_ratio=.5,seed=42,device="cpu"):
    if not isinstance(model_version,str) or not model_version.strip(): raise VisionTrainingError("model_version required")
    for name,digest in (("dataset_sha256",dataset_sha256),("feature_schema_sha256",feature_schema_sha256)):
        if not isinstance(digest,str) or not re.fullmatch(r"[0-9a-f]{64}",digest):
            raise VisionTrainingError(f"{name} must be lowercase SHA-256")
    for name,value,minimum in (("epochs",epochs,1),("batch_size",batch_size,1),("patience",patience,1),("seed",seed,0)):
        if isinstance(value,bool) or not isinstance(value,int) or value<minimum: raise VisionTrainingError(f"{name} must be >= {minimum}")
    for name,value in (("learning_rate",learning_rate),("weight_decay",weight_decay)):
        if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(float(value)) or value<=0:
            raise VisionTrainingError(f"{name} must be finite and positive")
    if isinstance(mask_ratio,bool) or not isinstance(mask_ratio,(int,float)) or not 0<mask_ratio<1:
        raise VisionTrainingError("mask_ratio must be strictly between 0 and 1")
    if not train_images or not validation_images: raise VisionTrainingError("train and validation images must be non-empty")
    try:
        import numpy as np
        import torch
        from torch.utils.data import DataLoader,TensorDataset
    except ImportError as exc: raise RuntimeError("PyTorch and NumPy required") from exc
    def tensorize(images,name):
        array=np.asarray(images,dtype=np.float32)
        if array.ndim!=4 or array.shape[1]!=3 or array.shape[0]==0: raise VisionTrainingError(f"{name} must be [N,3,H,W]")
        if not np.isfinite(array).all() or array.min()<0 or array.max()>1: raise VisionTrainingError(f"{name} pixels must be finite in [0,1]")
        return torch.tensor(array,dtype=torch.float32)
    train_x=tensorize(train_images,"train_images"); valid_x=tensorize(validation_images,"validation_images")
    if train_x.shape[1:]!=valid_x.shape[1:]: raise VisionTrainingError("image shapes must match")
    if train_x.shape[-1]!=train_x.shape[-2] or train_x.shape[-1]!=getattr(model,"image_size",None):
        raise VisionTrainingError("image shape must match model square image_size")
    random.seed(seed); np.random.seed(seed); torch.manual_seed(seed)
    if torch.cuda.is_available(): torch.cuda.manual_seed_all(seed)
    torch.use_deterministic_algorithms(True,warn_only=True)
    target_device=torch.device(device); model=model.to(target_device)
    loader_gen=torch.Generator().manual_seed(seed)
    train_loader=DataLoader(TensorDataset(train_x),batch_size=batch_size,shuffle=True,generator=loader_gen)
    valid_loader=DataLoader(TensorDataset(valid_x),batch_size=batch_size,shuffle=False)
    optimizer=torch.optim.AdamW(model.parameters(),lr=float(learning_rate),weight_decay=float(weight_decay))
    best_loss=float("inf"); best_epoch=0; best_state=None; stale=0; completed=0
    for epoch in range(1,epochs+1):
        model.train()
        for (batch,) in train_loader:
            batch=batch.to(target_device); optimizer.zero_grad(set_to_none=True)
            loss=model(batch,mask_ratio=float(mask_ratio))["loss"]
            if not torch.isfinite(loss): raise VisionTrainingError("non-finite training loss")
            loss.backward(); torch.nn.utils.clip_grad_norm_(model.parameters(),1.0); optimizer.step()
        model.eval(); val_gen=torch.Generator(device=target_device).manual_seed(seed+1); losses=[]
        with torch.no_grad():
            for (batch,) in valid_loader:
                value=model(batch.to(target_device),mask_ratio=float(mask_ratio),generator=val_gen)["loss"]
                if not torch.isfinite(value): raise VisionTrainingError("non-finite validation loss")
                losses.append(float(value.item()))
        current=sum(losses)/len(losses); completed=epoch
        if current<best_loss:
            best_loss=current; best_epoch=epoch; stale=0
            best_state={k:v.detach().cpu().clone() for k,v in model.state_dict().items()}
        else:
            stale+=1
            if stale>=patience: break
    if best_state is None: raise VisionTrainingError("no valid checkpoint produced")
    model.load_state_dict(best_state); buffer=BytesIO()
    torch.save({"state_dict":best_state,"metadata":{
        "schema_version":"nova.chart-mae.v1","model_version":model_version,
        "dataset_sha256":dataset_sha256,"feature_schema_sha256":feature_schema_sha256,
        "image_size":int(train_x.shape[-1]),"mask_ratio":float(mask_ratio),"seed":seed,
        "best_epoch":best_epoch,"epochs_completed":completed,"best_validation_loss":best_loss,
        "optimizer":"AdamW","objective":"masked_patch_reconstruction_mse","validation_mask_seed":seed+1,
    }},buffer)
    payload=buffer.getvalue()
    return VisionTrainingResult(payload,sha256(payload).hexdigest(),model_version,best_epoch,completed,best_loss,seed)
