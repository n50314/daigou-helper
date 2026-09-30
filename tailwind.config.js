export default {
  content: ['./index.html', './App.tsx', './components/**/*.{ts,tsx}', './types.ts'],
  safelist: ['bg-slate-100','text-slate-700','border-slate-200', ...['red','orange','yellow','green','blue','purple','pink'].flatMap(color => [`bg-${color}-50`, `bg-${color}-100`, `text-${color}-700`, `border-${color}-100`])],
  theme: { extend: { colors: { blue: { 50:'#F3F6FF', 100:'#E7EDFF', 200:'#CCD9FF', 300:'#9DB8FF', 400:'#7095E5', 500:'#3464CA', 600:'#002FA7', 700:'#002788' } }, fontFamily: { sans:['Helvetica Neue','Arial','Noto Sans TC','sans-serif'] } } },
  plugins: [],
};
