export const DEG = Math.PI / 180;

export function v3(x=0,y=0,z=0){ return [x,y,z]; }
export function add(a,b){ return [a[0]+b[0],a[1]+b[1],a[2]+b[2]]; }
export function sub(a,b){ return [a[0]-b[0],a[1]-b[1],a[2]-b[2]]; }
export function scale(a,s){ return [a[0]*s,a[1]*s,a[2]*s]; }
export function dot(a,b){ return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }
export function cross(a,b){ return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]; }
export function length(a){ return Math.hypot(a[0],a[1],a[2]); }
export function normalize(a){ const l=length(a)||1; return [a[0]/l,a[1]/l,a[2]/l]; }
export function clamp(v,min,max){ return Math.max(min,Math.min(max,v)); }

export function mat4Identity(){
  return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
}

export function mat4Multiply(a,b){
  const out=new Float32Array(16);
  for(let c=0;c<4;c++){
    for(let r=0;r<4;r++){
      out[c*4+r]=a[0*4+r]*b[c*4+0]+a[1*4+r]*b[c*4+1]+a[2*4+r]*b[c*4+2]+a[3*4+r]*b[c*4+3];
    }
  }
  return out;
}

export function mat4Translation(x,y,z){
  const m=mat4Identity(); m[12]=x;m[13]=y;m[14]=z; return m;
}
export function mat4Scale(x,y,z){
  const m=mat4Identity();m[0]=x;m[5]=y;m[10]=z;return m;
}
export function mat4RotX(a){
  const c=Math.cos(a),s=Math.sin(a); return new Float32Array([1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]);
}
export function mat4RotY(a){
  const c=Math.cos(a),s=Math.sin(a); return new Float32Array([c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]);
}
export function mat4RotZ(a){
  const c=Math.cos(a),s=Math.sin(a); return new Float32Array([c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1]);
}

export function modelMatrix(transform){
  const p=transform.position,r=transform.rotation.map(v=>v*DEG),s=transform.scale;
  let m=mat4Translation(p[0],p[1],p[2]);
  m=mat4Multiply(m,mat4RotY(r[1]));
  m=mat4Multiply(m,mat4RotX(r[0]));
  m=mat4Multiply(m,mat4RotZ(r[2]));
  return mat4Multiply(m,mat4Scale(s[0],s[1],s[2]));
}


export function mat4Ortho(left,right,bottom,top,near,far){
  const lr=1/(left-right),bt=1/(bottom-top),nf=1/(near-far);
  return new Float32Array([
    -2*lr,0,0,0,
    0,-2*bt,0,0,
    0,0,2*nf,0,
    (left+right)*lr,(top+bottom)*bt,(far+near)*nf,1
  ]);
}

export function mat4Perspective(fov,aspect,near,far){
  const f=1/Math.tan(fov/2),nf=1/(near-far);
  return new Float32Array([
    f/aspect,0,0,0,
    0,f,0,0,
    0,0,(far+near)*nf,-1,
    0,0,(2*far*near)*nf,0
  ]);
}

export function mat4LookAt(eye,target,up=[0,1,0]){
  const z=normalize(sub(eye,target));
  const x=normalize(cross(up,z));
  const y=cross(z,x);
  return new Float32Array([
    x[0],y[0],z[0],0,
    x[1],y[1],z[1],0,
    x[2],y[2],z[2],0,
    -dot(x,eye),-dot(y,eye),-dot(z,eye),1
  ]);
}

export function mat4Invert(a){
  const out=new Float32Array(16);
  const a00=a[0],a01=a[1],a02=a[2],a03=a[3],a10=a[4],a11=a[5],a12=a[6],a13=a[7],a20=a[8],a21=a[9],a22=a[10],a23=a[11],a30=a[12],a31=a[13],a32=a[14],a33=a[15];
  const b00=a00*a11-a01*a10,b01=a00*a12-a02*a10,b02=a00*a13-a03*a10,b03=a01*a12-a02*a11,b04=a01*a13-a03*a11,b05=a02*a13-a03*a12;
  const b06=a20*a31-a21*a30,b07=a20*a32-a22*a30,b08=a20*a33-a23*a30,b09=a21*a32-a22*a31,b10=a21*a33-a23*a31,b11=a22*a33-a23*a32;
  let det=b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06;
  if(!det) return mat4Identity(); det=1/det;
  out[0]=(a11*b11-a12*b10+a13*b09)*det; out[1]=(a02*b10-a01*b11-a03*b09)*det; out[2]=(a31*b05-a32*b04+a33*b03)*det; out[3]=(a22*b04-a21*b05-a23*b03)*det;
  out[4]=(a12*b08-a10*b11-a13*b07)*det; out[5]=(a00*b11-a02*b08+a03*b07)*det; out[6]=(a32*b02-a30*b05-a33*b01)*det; out[7]=(a20*b05-a22*b02+a23*b01)*det;
  out[8]=(a10*b10-a11*b08+a13*b06)*det; out[9]=(a01*b08-a00*b10-a03*b06)*det; out[10]=(a30*b04-a31*b02+a33*b00)*det; out[11]=(a21*b02-a20*b04-a23*b00)*det;
  out[12]=(a11*b07-a10*b09-a12*b06)*det; out[13]=(a00*b09-a01*b07+a02*b06)*det; out[14]=(a31*b01-a30*b03-a32*b00)*det; out[15]=(a20*b03-a21*b01+a22*b00)*det;
  return out;
}

export function transformPoint(m,p,w=1){
  const x=p[0],y=p[1],z=p[2];
  const ox=m[0]*x+m[4]*y+m[8]*z+m[12]*w;
  const oy=m[1]*x+m[5]*y+m[9]*z+m[13]*w;
  const oz=m[2]*x+m[6]*y+m[10]*z+m[14]*w;
  const ow=m[3]*x+m[7]*y+m[11]*z+m[15]*w;
  return ow && ow!==1 ? [ox/ow,oy/ow,oz/ow] : [ox,oy,oz];
}

export function normalMatrix3(m){
  const inv=mat4Invert(m);
  return new Float32Array([inv[0],inv[4],inv[8], inv[1],inv[5],inv[9], inv[2],inv[6],inv[10]]);
}

export function hexToRgb(hex){
  const clean=String(hex||'#ffffff').replace('#','');
  const full=clean.length===3?clean.split('').map(c=>c+c).join(''):clean.padEnd(6,'f');
  return [parseInt(full.slice(0,2),16)/255,parseInt(full.slice(2,4),16)/255,parseInt(full.slice(4,6),16)/255];
}

export function cameraForward(camera){
  const cp=Math.cos(camera.pitch),sp=Math.sin(camera.pitch),sy=Math.sin(camera.yaw),cy=Math.cos(camera.yaw);
  return normalize([sy*cp,sp,-cy*cp]);
}
export function cameraRight(camera){ return normalize(cross(cameraForward(camera),[0,1,0])); }
