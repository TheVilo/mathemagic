import json
from PIL import Image
F=json.load(open('frames.json'))
def pool(fr):
  h=len(fr); w=len(fr[0]); out=[]
  for y in range(0,h-1,2):
    line=''
    for x in range(0,w-1,2):
      cs=[fr[y][x],fr[y][x+1],fr[y+1][x],fr[y+1][x+1]]
      op=[c for c in cs if c!='.']
      if len(op)<2: line+='.'; continue
      if 'C' in op: line+='C'; continue
      d=[int(c) for c in op]
      line+=str(max(d) if max(d)>=6 else min(8,round(0.5*min(d)+0.5*sum(d)/len(d))+1))
    out.append(line)
  return out
S=[[pool(f) for f in row] for row in F]
json.dump(S,open('small.json','w'))
def render(fr,scale=8):
  hh=len(fr); ww=len(fr[0]); img=Image.new('RGB',(ww*scale,hh*scale),(205,203,198)); px=img.load()
  for y,l in enumerate(fr):
    for x,c in enumerate(l):
      if c=='.': continue
      col=(96,190,104) if c=='C' else tuple([int(20+int(c)/9*215)]*3)
      for j in range(scale):
        for i in range(scale): px[x*scale+i,y*scale+j]=col
  return img
tiles=[render(f) for row in S for f in row]
Wm=max(t.width for t in tiles); Hm=max(t.height for t in tiles)
sheet=Image.new('RGB',(Wm*4,Hm*4),(205,203,198))
for i,t in enumerate(tiles): sheet.paste(t,((i%4)*Wm,(i//4)*Hm))
sheet.save('preview_small.png'); print(len(S[0][0]),len(S[0][0][0]))
