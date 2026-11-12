import ctypes, ctypes.wintypes as w, os, struct, sys, runpy
kernel=ctypes.WinDLL('kernel32',use_last_error=True)
nt=ctypes.WinDLL('ntdll')
kernel.CreateFileW.argtypes=[w.LPCWSTR,w.DWORD,w.DWORD,w.LPVOID,w.DWORD,w.DWORD,w.HANDLE]
kernel.CreateFileW.restype=w.HANDLE
kernel.CloseHandle.argtypes=[w.HANDLE]
class IO(ctypes.Structure):
 _fields_=[('Status',ctypes.c_void_p),('Information',ctypes.c_size_t)]
nt.NtSetEaFile.argtypes=[w.HANDLE,ctypes.POINTER(IO),w.LPVOID,w.ULONG]
nt.NtSetEaFile.restype=ctypes.c_long
nt.NtQueryEaFile.argtypes=[w.HANDLE,ctypes.POINTER(IO),w.LPVOID,w.ULONG,ctypes.c_ubyte,w.LPVOID,w.ULONG,w.LPVOID,ctypes.c_ubyte]
nt.NtQueryEaFile.restype=ctypes.c_long
def handle(path):
 h=kernel.CreateFileW(str(path),0x18,7,None,3,0x02000000,None)
 if h==w.HANDLE(-1).value: raise ctypes.WinError(ctypes.get_last_error())
 return h
def setxattr(path,name,value,*args,**kwargs):
 name=os.fsencode(name);value=bytes(value);raw=struct.pack('<IBBH',0,0,len(name),len(value))+name+b'\0'+value
 buf=ctypes.create_string_buffer(raw);io=IO();h=handle(path)
 try:
  status=nt.NtSetEaFile(h,ctypes.byref(io),buf,len(raw))
  if status<0: raise OSError('NtSetEaFile status '+hex(status&0xffffffff))
 finally: kernel.CloseHandle(h)
def getxattr(path,name,*args,**kwargs):
 name=os.fsencode(name);request=struct.pack('<IB',0,len(name))+name+b'\0';req=ctypes.create_string_buffer(request);buf=ctypes.create_string_buffer(65536);io=IO();h=handle(path)
 try:
  status=nt.NtQueryEaFile(h,ctypes.byref(io),buf,len(buf),1,req,len(request),None,1)
  if status<0: raise OSError('NtQueryEaFile status '+hex(status&0xffffffff))
  _,_,nl,vl=struct.unpack('<IBBH',buf.raw[:8]);return buf.raw[8+nl+1:8+nl+1+vl]
 finally: kernel.CloseHandle(h)
os.setxattr=setxattr
os.getxattr=getxattr
helper=sys.argv[1];sys.argv=sys.argv[1:];runpy.run_path(helper,run_name='__main__')
