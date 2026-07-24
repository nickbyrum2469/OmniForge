from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

ROOT=Path(__file__).resolve().parents[1]
SIZE=512

def seamless_noise(size, seed, octaves=((16,0.55),(32,0.28),(64,0.12),(128,0.05))):
    rng=np.random.default_rng(seed)
    total=np.zeros((size,size),dtype=np.float32)
    weight=0.0
    for cells,w in octaves:
        tile=rng.random((cells,cells),dtype=np.float32)
        img=Image.fromarray(np.uint8(tile*255),'L').resize((size,size),Image.Resampling.BICUBIC)
        arr=np.asarray(img,dtype=np.float32)/255.0
        # Force edge continuity by averaging opposite borders in a wide band.
        band=max(4,size//32)
        for k in range(band):
            t=k/(band-1)
            avg=(arr[:,k]+arr[:,-1-k])*0.5
            arr[:,k]=avg*(1-t)+arr[:,k]*t
            arr[:,-1-k]=avg*(1-t)+arr[:,-1-k]*t
            avg=(arr[k,:]+arr[-1-k,:])*0.5
            arr[k,:]=avg*(1-t)+arr[k,:]*t
            arr[-1-k,:]=avg*(1-t)+arr[-1-k,:]*t
        total += arr*w; weight += w
    total/=weight
    return np.clip(total,0,1)

def normal_from_height(height,strength=3.0):
    dx=np.roll(height,-1,axis=1)-np.roll(height,1,axis=1)
    dy=np.roll(height,-1,axis=0)-np.roll(height,1,axis=0)
    nx=-dx*strength; ny=-dy*strength; nz=np.ones_like(height)
    norm=np.sqrt(nx*nx+ny*ny+nz*nz)
    normal=np.stack([nx/norm,ny/norm,nz/norm],axis=-1)*0.5+0.5
    return np.uint8(np.clip(normal*255,0,255))

def save_rgba(arr,path):
    if arr.ndim==2: arr=np.repeat(arr[...,None],3,axis=-1)
    alpha=np.full((*arr.shape[:2],1),255,dtype=np.uint8)
    Image.fromarray(np.concatenate([np.uint8(np.clip(arr,0,255)),alpha],axis=-1),'RGBA').save(path,optimize=True)

def make_grass(out):
    n=seamless_noise(SIZE,1337)
    fine=seamless_noise(SIZE,7331,((48,.55),(96,.3),(192,.15)))
    earth=np.clip((fine-.58)*4,0,1)
    c0=np.array([50,72,39.],dtype=np.float32); c1=np.array([91,116,64.],dtype=np.float32)
    color=c0+(c1-c0)*n[...,None]
    soil=np.array([104,79,51.],dtype=np.float32)
    color=color*(1-earth[...,None]*.36)+soil*earth[...,None]*.36
    # Periodic blade streaks give directional micro detail without visible seams.
    y,x=np.mgrid[0:SIZE,0:SIZE]
    blade=(np.sin(x*.47+y*.16)+np.sin(x*.91-y*.11+2.1))*0.5
    blade=np.clip((blade-.55)*1.8,0,1)
    color[...,1]+=blade*18; color[...,0]-=blade*5
    height=np.clip(n*.55+fine*.32+blade*.13,0,1)
    rough=np.uint8(np.clip((.86+(fine-.5)*.12)*255,0,255))
    ao=np.uint8(np.clip((.82+height*.18)*255,0,255))
    save_rgba(color,out/'basecolor.png'); save_rgba(normal_from_height(height,4.2),out/'normal.png'); save_rgba(rough,out/'roughness.png'); save_rgba(ao,out/'ao.png'); save_rgba(np.uint8(height*255),out/'height.png')

def make_dirt(out):
    n=seamless_noise(SIZE,2468)
    fine=seamless_noise(SIZE,8642,((32,.42),(72,.35),(160,.23)))
    gravel=np.clip((fine-.68)*3.2,0,1)
    c0=np.array([75,53,35.],dtype=np.float32); c1=np.array([151,116,77.],dtype=np.float32)
    color=c0+(c1-c0)*(n*.72+fine*.28)[...,None]
    color += gravel[...,None]*np.array([32,29,24.])
    y,x=np.mgrid[0:SIZE,0:SIZE]
    rut=(np.sin(x*.032+y*.009)+1)*.5
    rut=np.clip((rut-.76)*2.5,0,1)
    color*=1-rut[...,None]*.14
    height=np.clip(n*.45+fine*.42+gravel*.13-rut*.12,0,1)
    rough=np.uint8(np.clip((.78+(fine-.5)*.14)*255,0,255))
    ao=np.uint8(np.clip((.79+height*.2-rut*.08)*255,0,255))
    save_rgba(color,out/'basecolor.png'); save_rgba(normal_from_height(height,5.2),out/'normal.png'); save_rgba(rough,out/'roughness.png'); save_rgba(ao,out/'ao.png'); save_rgba(np.uint8(height*255),out/'height.png')

for slug,fn in [('material-highland-grass',make_grass),('material-packed-earth',make_dirt)]:
    out=ROOT/'assets'/'materials'/slug
    out.mkdir(parents=True,exist_ok=True)
    fn(out)
    print(out)
