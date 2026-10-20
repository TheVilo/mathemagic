from PIL import Image
import numpy as np, colorsys, json, sys
src=sys.argv[1]
im=np.asarray(Image.open(src).convert('RGB')).astype(float)
H,W,_=im.shape
p=W/196.0
# find grid phase with the most uniform blocks
best=None
for oy in np.arange(0,p,1):
  for ox in np.arange(0,p,1):
    err=0
    for gy in range(5,200,9):
      for gx in range(5,190,9):
        cx=int(ox+gx*p+p/2); cy=int(oy+gy*p+p/2)
        if cy+3>=H or cx+3>=W: continue
        blk=im[cy-3:cy+4,cx-3:cx+4]
        err+=blk.std(axis=(0,1)).sum()
    if best is None or err<best[0]: best=(err,ox,oy)
_,ox,oy=best
gw=int((W-ox)/p); gh=int((H-oy)/p)
small=np.zeros((gh,gw,3))
for gy in range(gh):
  for gx in range(gw):
    cx=int(ox+gx*p+p/2); cy=int(oy+gy*p+p/2)
    small[gy,gx]=np.median(im[cy-2:cy+3,cx-2:cx+3].reshape(-1,3),axis=0)
print('phase',ox,oy,'grid',gw,gh)
Image.fromarray(small.astype(np.uint8)).resize((gw*4,gh*4),Image.NEAREST).save('grid.png')
np.save('small.npy',small)
