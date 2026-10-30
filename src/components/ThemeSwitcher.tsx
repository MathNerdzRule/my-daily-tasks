import React, { useEffect, useState } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';

export const ThemeSwitcher: React.FC = () => {
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
    return (localStorage.getItem('theme') as any) || 'system';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    const applyTheme = (t: 'light' | 'dark') => {
      if (t === 'dark') {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      applyTheme(systemTheme);
      
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = (e: MediaQueryListEvent) => applyTheme(e.matches ? 'dark' : 'light');
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    } else {
      applyTheme(theme);
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  return (
    <div className="flex bg-[#E9EEF6] dark:bg-[#282A30] p-1 rounded-full border border-slate-200/50 dark:border-white/5 gap-0.5">
      {[
        { id: 'light', icon: Sun, label: 'Light' },
        { id: 'system', icon: Monitor, label: 'System' },
        { id: 'dark', icon: Moon, label: 'Dark' }
      ].map((t) => (
        <button
          key={t.id}
          onClick={() => setTheme(t.id as any)}
          title={`Switch to ${t.label} theme`}
          className={`p-1.5 rounded-full transition-all flex items-center justify-center ${
            theme === t.id 
              ? 'bg-[#00639B] text-white dark:bg-[#92CCFF] dark:text-[#003353] shadow-sm' 
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <t.icon size={15} />
        </button>
      ))}
    </div>
  );
};
