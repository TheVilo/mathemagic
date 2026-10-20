import numpy as np, colorsys, json
from PIL import Image
from scipy import ndimage
small=np.load('small.npy'); gh,gw,_=small.shape
cw=gw/4; ch=gh/4
frames=[]
def hsv(c): return colorsys.rgb_to_hsv(*(c/255))
for r in range(4):
  row=[]
  for c in range(4):
    x0=int(round(c*cw)); x1=int(round((c+1)*cw)); y0=int(round(r*ch)); y1=int(round((r+1)*ch))
    cell=small[y0:y1,x0:x1]; h,w,_=cell.shape
    bg=cell.min(2)>205
    H_=np.zeros((h,w)); S_=np.zeros((h,w)); V_=np.zeros((h,w))
    for y in range(h):
      for x in range(w):
        H_[y,x],S_[y,x],V_[y,x]=hsv(cell[y,x])
    shadow=(S_<0.12)&(V_>0.36)&(V_<0.75)
    solid=~bg & ~shadow
    lab,n=ndimage.label(solid)
    sizes=ndimage.sum(solid,lab,range(1,n+1))
    main=lab==(np.argmax(sizes)+1)
    # dilate main slightly to keep staff/crystal attached pieces
    keep=main.copy()
    for k in range(1,n+1):
      comp=lab==k
      if sizes[k-1]>=6 and ndimage.binary_dilation(main,iterations=2)[comp].any(): keep|=comp
    sat=(S_>0.45)&(V_>0.42)&keep
    sl,sn=ndimage.label(sat)
    crystal=np.zeros_like(sat)
    if sn:
      ss=ndimage.sum(sat,sl,range(1,sn+1)); crystal=sl==(np.argmax(ss)+1)
    eyes=sat&~crystal
    ys,xs=np.where(keep); 
    out=[]
    for y in range(ys.min(),ys.max()+1):
      line=''
      for x in range(xs.min(),xs.max()+1):
        if not keep[y,x]: line+='.'; continue
        if crystal[y,x]: line+='C'; continue
        if eyes[y,x]: line+='9'; continue
        c_=cell[y,x]; lum=(0.299*c_[0]+0.587*c_[1]+0.114*c_[2])/255
        v=min(1,max(0,(lum-0.07)/0.48))**0.85
        line+=str(min(8,int(v*8.99)))
      out.append(line)
    row.append(out)
  frames.append(row)
json.dump(frames,open('frames.json','w'))
# preview
def render(fr,scale=6):
  hh=len(fr); ww=len(fr[0]); img=Image.new('RGB',(ww*scale,hh*scale),(205,203,198))
  px=img.load()
  for y,l in enumerate(fr):
    for x,chh in enumerate(l):
      if chh=='.': continue
      col=(96,190,104) if chh=='C' else tuple([int(20+int(chh)/9*215)]*3)
      for j in range(scale):
        for i in range(scale): px[x*scale+i,y*scale+j]=col
  return img
tiles=[render(f) for row in frames for f in row]
Wm=max(t.width for t in tiles); Hm=max(t.height for t in tiles)
sheet=Image.new('RGB',(Wm*4,Hm*4),(205,203,198))
for i,t in enumerate(tiles): sheet.paste(t,((i%4)*Wm,(i//4)*Hm))
sheet.save('preview.png')
print([[ (len(f[0]),len(f)) for f in row] for row in frames])
