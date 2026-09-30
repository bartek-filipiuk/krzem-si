"""Optional art pipeline: replay recorded scene calls using Mesa EGL on Linux.
Requires libEGL (Mesa), Python 3 and Pillow. Not needed to build or run the website.
Usage: node scripts/art/capture.mjs /tmp/krzem-scenes
       python scripts/art/render_posters.py /tmp/krzem-scenes src/assets
"""
import ctypes as C
import json
import os
import sys
from pathlib import Path
from PIL import Image

os.environ.setdefault('LIBGL_ALWAYS_SOFTWARE', '1')
e = C.CDLL('libEGL.so.1')
I, U, P, F, B = C.c_int, C.c_uint, C.c_void_p, C.c_float, C.c_ubyte
for name, args, result in [
    ('eglGetProcAddress', [C.c_char_p], P),
    ('eglInitialize', [P,C.POINTER(I),C.POINTER(I)], I),
    ('eglBindAPI', [I], I),
    ('eglChooseConfig', [P,C.POINTER(I),C.POINTER(P),I,C.POINTER(I)], I),
    ('eglCreateContext', [P,P,P,C.POINTER(I)], P),
    ('eglCreatePbufferSurface', [P,P,C.POINTER(I)], P),
    ('eglMakeCurrent', [P,P,P,P], I),
    ('eglDestroySurface', [P,P], I),
    ('eglDestroyContext', [P,P], I),
    ('eglTerminate', [P], I),
]:
    fn = getattr(e, name); fn.argtypes = args; fn.restype = result
get_display = C.CFUNCTYPE(P,I,P,C.POINTER(I))(e.eglGetProcAddress(b'eglGetPlatformDisplayEXT'))
display = get_display(0x31DD, None, None)
major, minor = I(), I()
if not e.eglInitialize(display,C.byref(major),C.byref(minor)):
    raise RuntimeError('Mesa surfaceless EGL initialization failed')
e.eglBindAPI(0x30A0)
attrs = (I*15)(0x3033,1,0x3040,4,0x3024,8,0x3023,8,0x3022,8,0x3021,8,0x3025,24,0x3038)
config, count = P(), I()
e.eglChooseConfig(display,attrs,C.byref(config),1,C.byref(count))
if not count.value: raise RuntimeError('No EGL RGBA8/depth24 configuration')
context = e.eglCreateContext(display,config,None,(I*3)(0x3098,2,0x3038))
surface = e.eglCreatePbufferSurface(display,config,(I*5)(0x3057,1440,0x3056,1000,0x3038))
if not e.eglMakeCurrent(display,surface,surface,context): raise RuntimeError('EGL make-current failed')

def gl(name, ret, *args):
    ptr = e.eglGetProcAddress(name.encode())
    if not ptr: raise RuntimeError('GL function missing: '+name)
    return C.CFUNCTYPE(ret,*args)(ptr)

CreateShader=gl('glCreateShader',U,U)
ShaderSource=gl('glShaderSource',None,U,I,C.POINTER(C.c_char_p),C.POINTER(I))
CompileShader=gl('glCompileShader',None,U)
GetShaderiv=gl('glGetShaderiv',None,U,U,C.POINTER(I))
GetShaderInfoLog=gl('glGetShaderInfoLog',None,U,I,C.POINTER(I),P)
CreateProgram=gl('glCreateProgram',U)
AttachShader=gl('glAttachShader',None,U,U)
BindAttribLocation=gl('glBindAttribLocation',None,U,U,C.c_char_p)
LinkProgram=gl('glLinkProgram',None,U)
GetProgramiv=gl('glGetProgramiv',None,U,U,C.POINTER(I))
GetProgramInfoLog=gl('glGetProgramInfoLog',None,U,I,C.POINTER(I),P)
UseProgram=gl('glUseProgram',None,U)
GenBuffers=gl('glGenBuffers',None,I,C.POINTER(U))
BindBuffer=gl('glBindBuffer',None,U,U)
BufferData=gl('glBufferData',None,U,C.c_ssize_t,P,U)
EnableVertexAttribArray=gl('glEnableVertexAttribArray',None,U)
VertexAttribPointer=gl('glVertexAttribPointer',None,U,I,U,B,I,P)
GetUniformLocation=gl('glGetUniformLocation',I,U,C.c_char_p)
UniformMatrix4fv=gl('glUniformMatrix4fv',None,I,I,B,C.POINTER(F))
Uniform3fv=gl('glUniform3fv',None,I,I,C.POINTER(F))
Uniform1f=gl('glUniform1f',None,I,F)
Enable=gl('glEnable',None,U)
BlendFunc=gl('glBlendFunc',None,U,U)
ClearColor=gl('glClearColor',None,F,F,F,F)
Clear=gl('glClear',None,U)
Viewport=gl('glViewport',None,I,I,I,I)
DepthMask=gl('glDepthMask',None,B)
DrawArrays=gl('glDrawArrays',None,U,I,I)
ReadPixels=gl('glReadPixels',None,I,I,I,I,U,U,P)
Finish=gl('glFinish',None)
GetError=gl('glGetError',U)
DeleteBuffers=gl('glDeleteBuffers',None,I,C.POINTER(U))
DeleteShader=gl('glDeleteShader',None,U)
DeleteProgram=gl('glDeleteProgram',None,U)

source=Path(sys.argv[1]); target=Path(sys.argv[2]);target.mkdir(parents=True,exist_ok=True)
for path in sorted(source.glob('scene-*.json')):
    data=json.loads(path.read_text());program=CreateProgram();shaders=[]
    for type_, text in zip([0x8B31,0x8B30],data['shaders']):
        shader=CreateShader(type_);encoded=text.encode();strings=(C.c_char_p*1)(encoded)
        ShaderSource(shader,1,strings,None);CompileShader(shader);ok=I();GetShaderiv(shader,0x8B81,C.byref(ok))
        if not ok.value:
            log=C.create_string_buffer(10000);GetShaderInfoLog(shader,10000,None,log);raise RuntimeError(log.value.decode())
        AttachShader(program,shader);shaders.append(shader)
    for i,name in enumerate(['aPosition','aNormal','aColor']):BindAttribLocation(program,i,name.encode())
    LinkProgram(program);ok=I();GetProgramiv(program,0x8B82,C.byref(ok))
    if not ok.value:
        log=C.create_string_buffer(10000);GetProgramInfoLog(program,10000,None,log);raise RuntimeError(log.value.decode())
    UseProgram(program);Enable(0x0B71);Enable(0x0BE2);BlendFunc(0x0302,0x0303)
    Viewport(0,0,1440,1000);ClearColor(0,0,0,0);Clear(0x4000|0x0100)
    buffers={}
    for key,values in data['buffers'].items():
        ident=U();GenBuffers(1,C.byref(ident));buffers[key]=ident
        BindBuffer(0x8892,ident);array=(F*len(values))(*values);BufferData(0x8892,C.sizeof(array),array,0x88E4)
    for call in data['calls']:
        BindBuffer(0x8892,buffers[str(call['buffer'])])
        for i in range(3):EnableVertexAttribArray(i);VertexAttribPointer(i,3,0x1406,0,36,P(i*12))
        for name,value in call['uniforms'].items():
            loc=GetUniformLocation(program,name.encode())
            if isinstance(value,list):
                array=(F*len(value))(*value)
                if len(value)==16:UniformMatrix4fv(loc,1,0,array)
                else:Uniform3fv(loc,1,array)
            else:Uniform1f(loc,value)
        DepthMask(call['uniforms']['uOpacity']>.98)
        DrawArrays(4,call['start'],call['count'])
    DepthMask(1);Finish()
    error=GetError()
    if error:raise RuntimeError(f'GL error: {error:x} in {path.name}')
    pixels=(B*(1440*1000*4))();ReadPixels(0,0,1440,1000,0x1908,0x1401,pixels)
    image=Image.frombytes('RGBA',(1440,1000),bytes(pixels)).transpose(Image.Transpose.FLIP_TOP_BOTTOM)
    image.save(source/(path.stem+'.png'))
    # A shared framing matches the desktop composition; transparency preserves responsive placement.
    cropped=image.crop((555,75,1415,925)).resize((860,850),Image.Resampling.LANCZOS)
    cropped.save(target/(path.stem+'.webp'),quality=88,method=6)
    for buf in buffers.values():DeleteBuffers(1,C.byref(buf))
    for shader in shaders:DeleteShader(shader)
    DeleteProgram(program)
    print(path.stem, 'shader/link/draw OK;',len(data['calls']),'draw calls;', (target/(path.stem+'.webp')).stat().st_size,'bytes')
e.eglMakeCurrent(display,None,None,None);e.eglDestroySurface(display,surface);e.eglDestroyContext(display,context);e.eglTerminate(display)
