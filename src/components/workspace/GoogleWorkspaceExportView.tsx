import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import firebaseConfig from '../../../firebase-applet-config.json';
import { HardDrive, FileText, CheckCircle2, Download, ShieldCheck, RefreshCw, Key, LogOut } from 'lucide-react';

// Initialize Firebase App / Auth if not already initialized
let app;
try {
  app = initializeApp(firebaseConfig);
} catch {
  // Already initialized
}
const auth = getAuth();
const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.readonly');

export default function GoogleWorkspaceExportView() {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<Array<{ name: string; id: string; mimeType: string }>>([]);
  const [selectedFileContent, setSelectedFileContent] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => {
    try {
      setLoading(true);
      setStatusMessage('Authenticating with Google Drive...');
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setAccessToken(credential.accessToken);
        setUser(result.user);
        setStatusMessage('Authentication successful! Fetching research files...');
        await fetchDriveFiles(credential.accessToken);
      }
    } catch (err: any) {
      console.error('Google Sign-In Error:', err);
      setStatusMessage(`Sign-In Error: ${err.message || 'Failed to authenticate'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await auth.signOut();
    setAccessToken(null);
    setFiles([]);
    setSelectedFileContent(null);
    setSelectedFileName(null);
    setStatusMessage('Signed out successfully.');
  };

  const fetchDriveFiles = async (token: string) => {
    try {
      setLoading(true);
      const q = encodeURIComponent("name contains 'oos_' or name contains 'manifest' or name contains 'checkpoint' or name contains 'equity'");
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=20&fields=files(id,name,mimeType,size)`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        throw new Error(`Google Drive file listing failed (HTTP ${res.status})`);
      }
      const data = await res.json();
      const actualFiles = Array.isArray(data.files) ? data.files : [];
      setFiles(actualFiles);
      setSelectedFileContent(null);
      setSelectedFileName(null);
      setStatusMessage(
        actualFiles.length > 0
          ? `Found ${actualFiles.length} actual research files in Google Drive.`
          : 'No matching research files were found in this Google Drive account.'
      );
    } catch (err: any) {
      console.error('Drive fetch error:', err);
      setFiles([]);
      setSelectedFileContent(null);
      setSelectedFileName(null);
      setStatusMessage(err?.message || 'Unable to retrieve files from Google Drive.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectFile = async (file: { name: string; id: string; mimeType: string }) => {
    if (!accessToken) {
      setStatusMessage('Google Drive access token is unavailable. Sign in again.');
      return;
    }

    setSelectedFileName(file.name);
    setSelectedFileContent(null);
    setLoading(true);
    try {
      let url: string;
      if (file.mimeType === 'application/vnd.google-apps.document') {
        url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}/export?mimeType=text/plain`;
      } else if (file.mimeType === 'application/vnd.google-apps.spreadsheet') {
        url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}/export?mimeType=text/csv`;
      } else if (
        file.mimeType.startsWith('text/') ||
        file.mimeType === 'application/json' ||
        file.mimeType === 'application/csv'
      ) {
        url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`;
      } else {
        throw new Error(`Unsupported preview type: ${file.mimeType}. Only text, JSON, CSV, Google Docs, and Google Sheets are supported.`);
      }

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) {
        throw new Error(`Google Drive file download failed (HTTP ${response.status})`);
      }
      const actualContent = await response.text();
      setSelectedFileContent(actualContent);
      setStatusMessage(`Loaded actual file content from Google Drive: ${file.name}`);
    } catch (err: any) {
      setSelectedFileContent(null);
      setStatusMessage(err?.message || 'Unable to preview this Google Drive file.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#07070e] text-slate-100 p-6 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-blue-950/60 to-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-1">
              <HardDrive className="w-4 h-4 animate-pulse" />
              Google Workspace & Drive Integration
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Google Drive Research Files Export
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              เชื่อมต่อ Google Drive ด้วยสิทธิ์ Read-Only เพื่อดึงไฟล์ประเมินผล (OOS Metrics, OOS Trades, Manifests, Checkpoint SHA256 และ Equity Curve)
            </p>
          </div>

          <div>
            {!user ? (
              <button
                onClick={handleSignIn}
                disabled={loading}
                className="gsi-material-button inline-flex items-center gap-3 bg-white hover:bg-slate-100 text-slate-800 font-medium px-5 py-2.5 rounded-xl shadow-lg transition-all cursor-pointer"
              >
                <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-5 h-5">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                </svg>
                <span>Sign in with Google</span>
              </button>
            ) : (
              <div className="flex items-center gap-3 bg-slate-950/80 border border-slate-800 px-4 py-2 rounded-xl">
                <div className="text-xs">
                  <div className="font-bold text-white">{user.displayName || user.email}</div>
                  <div className="text-emerald-400 font-mono text-[10px]">Google Drive Connected</div>
                </div>
                <button
                  onClick={handleSignOut}
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-all"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {statusMessage && (
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-cyan-300 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* File Explorer List */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4 text-cyan-400" />
              Requested Research Files ({files.length})
            </h2>

            {!user ? (
              <div className="text-center py-10 text-slate-500 text-xs font-mono">
                กรุณา Sign in with Google เพื่อเข้าถึงไฟล์ใน Google Drive
              </div>
            ) : files.length === 0 ? (
              <div className="text-center py-10 text-slate-500 text-xs font-mono">
                ไม่พบไฟล์ใน Google Drive หรือกำลังโหลด...
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                {files.map((file) => (
                  <button
                    key={file.id}
                    onClick={() => handleSelectFile(file)}
                    className={`w-full text-left p-3 rounded-xl border text-xs font-mono transition-all flex items-center justify-between ${
                      selectedFileName === file.name
                        ? 'bg-cyan-500/20 border-cyan-400 text-white'
                        : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="truncate flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <span className="truncate">{file.name}</span>
                    </div>
                    <span className="text-[10px] text-slate-500 shrink-0">View</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* File Preview & Export */}
          <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4 flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-bold text-white font-mono">
                  {selectedFileName ? `Preview: ${selectedFileName}` : 'Select a file to preview'}
                </h2>
              </div>
              {selectedFileContent && (
                <button
                  onClick={() => {
                    const blob = new Blob([selectedFileContent], { type: 'text/plain;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = selectedFileName || 'research_export.txt';
                    a.click();
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-mono transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download File
                </button>
              )}
            </div>

            <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-300 min-h-[320px] max-h-[400px] overflow-auto whitespace-pre">
              {selectedFileContent || '// เลือกไฟล์จากรายการด้านซ้ายเพื่อดูเนื้อหาและส่งออก'}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
