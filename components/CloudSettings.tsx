import React, { useState } from 'react';
import { UserProfile } from '../types';
import { X, Cloud, Check, AlertTriangle, LogOut, UserCircle } from 'lucide-react';
import { loginWithGoogle, logoutFirebase } from '../services/cloudService';
import { MotionPresence } from './Motion';

interface CloudSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile | null;
  syncStatus: string;
}

const CloudSettings: React.FC<CloudSettingsProps> = ({
  isOpen, onClose, user, syncStatus
}) => {
  const [loginError, setLoginError] = useState('');

  const handleLogin = async () => {
      setLoginError('');
      try {
          await loginWithGoogle();
          onClose();
      } catch (err: any) {
          if (err.message.includes("系統設定錯誤")) {
             setLoginError(err.message);
          } else if (err.code === 'auth/configuration-not-found') {
             setLoginError('登入失敗：Firebase Console Authentication 尚未啟用 Google 登入');
          } else if (err.code === 'auth/operation-not-allowed') {
             setLoginError('登入失敗：此登入方式未啟用');
          } else if (err.code === 'auth/popup-closed-by-user') {
             setLoginError('使用者取消登入');
          } else {
             setLoginError('登入失敗: ' + err.message);
          }
      }
  };

  const LoginView = () => (
    <div className="space-y-6 py-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Cloud className="w-8 h-8 text-blue-600" />
            </div>
            <h3 className="text-xl font-bold text-slate-800">雲端同步登入</h3>
            <p className="text-sm text-slate-500 max-w-xs mx-auto">
                使用 Google 帳號登入，即可在不同裝置間同步您的訂單資料。
            </p>
        </div>

        <button
            onClick={handleLogin}
            className="w-full max-w-sm mx-auto bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold py-3 px-4 rounded-lg shadow-sm flex items-center justify-center gap-3 transition-all hover:shadow-md transform active:scale-95"
        >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            使用 Google 帳號登入
        </button>

        {loginError && (
            <div className="bg-red-50 border border-red-100 text-red-600 p-3 rounded-md text-xs flex items-center justify-center gap-2 max-w-sm mx-auto">
                <AlertTriangle className="w-4 h-4" />
                <span>{loginError}</span>
            </div>
        )}
    </div>
  );

  const UserProfileView = () => (
    <div className="text-center py-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
        {user?.photoURL ? <img src={user.photoURL} alt="帳號頭像" className="w-24 h-24 rounded-full border-4 border-blue-100 mx-auto mb-4" /> :
          <div className="w-24 h-24 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4"><UserCircle size={48} /></div>}
        <h3 className="font-bold text-xl text-slate-800">{user?.displayName}</h3>
        <p className="text-sm text-slate-500 mb-6">{user?.email}</p>

        <div className="inline-flex items-center gap-2 text-green-700 bg-green-50 px-4 py-2 rounded-full text-sm font-medium border border-green-100 mb-8">
            <Check className="w-4 h-4" /> {syncStatus === 'saved' ? '帳號資料已同步' : syncStatus === 'error' || syncStatus === 'conflict' ? '同步暫停，請查看主畫面提示' : '正在同步帳號資料'}
        </div>

        <div className="border-t border-slate-100 pt-6">
            <button
                onClick={logoutFirebase}
                className="text-red-500 hover:text-red-700 text-sm font-medium flex items-center justify-center gap-2 mx-auto hover:bg-red-50 px-4 py-2 rounded-md transition-colors"
            >
                <LogOut className="w-4 h-4" /> 登出帳號
            </button>
        </div>
    </div>
  );

  return (
    <MotionPresence show={isOpen} onDismiss={onClose}>
    <div className="dialog-backdrop fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-label={user ? '帳號資訊' : '登入'} className="dialog-panel bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-white sticky top-0 z-10">
          <h3 className="text-lg font-bold text-slate-800">
            {user ? '帳號資訊' : '登入'}
          </h3>
          <button aria-label="關閉登入視窗" onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
           {user ? <UserProfileView /> : <LoginView />}
        </div>
      </div>
    </div>
    </MotionPresence>
  );
};

export default CloudSettings;
