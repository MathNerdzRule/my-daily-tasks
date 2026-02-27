import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Repeat } from 'lucide-react';
import { format, addDays, subDays, getDay } from 'date-fns';

export interface Task {
  id: number;
  title: string;
  start: string;
  end: string;
  category: string;
  priority: number;
  date: string; // ISO date string
  reminderMinutes?: number; 
  recurring?: {
    type: 'none' | 'daily' | 'weekdays' | 'custom';
    days?: number[]; // 0-6 for Sun-Sat
  };
  exceptions?: string[]; // ISO date strings
}

const CATEGORY_COLORS: Record<string, string> = {
  Work: 'border-blue-500 bg-blue-50 dark:bg-blue-900/20',
  Personal: 'border-purple-500 bg-purple-50 dark:bg-purple-900/20',
  Health: 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20',
  Urgent: 'border-red-500 bg-red-50 dark:bg-red-900/20',
  Leisure: 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
};

export const TimelineView: React.FC<{ 
  tasks: Task[], 
  onEdit: (t: Task, date: string) => void,
  selectedDate: Date,
  setSelectedDate: React.Dispatch<React.SetStateAction<Date>>
}> = ({ tasks, onEdit, selectedDate, setSelectedDate }) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const hours = Array.from({ length: 24 }, (_, i) => i);

  const dateKey = format(selectedDate, 'yyyy-MM-dd');
  const dayOfWeek = getDay(selectedDate); // 0-6

  const dailyTasks = tasks.filter(t => {
    // Check if this date is explicitly excluded
    if (t.exceptions?.includes(dateKey)) return false;

    // Show if it's for this specific date
    if (t.date === dateKey) return true;

    // Only allow recurring tasks to appear on dates after their creation date
    if (t.date > dateKey) return false;

    // Check recurrence rules
    if (t.recurring) {
      if (t.recurring.type === 'daily') return true;
      if (t.recurring.type === 'weekdays' && dayOfWeek >= 1 && dayOfWeek <= 5) return true;
      if (t.recurring.type === 'custom' && t.recurring.days?.includes(dayOfWeek)) return true;
    }

    return false;
  });

  useEffect(() => {
    // Scroll to 7 AM (7 * 60px per hour = 420px)
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 7 * 60 - 20;
    }
  }, []);

  const getPosition = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    return (h * 60 + m); 
  };

  const format12h = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    const hour = h % 12 || 12;
    const ampm = h < 12 ? 'AM' : 'PM';
    return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  const getHeight = (start: string, end: string) => {
    const startMins = getPosition(start);
    const endMins = getPosition(end);
    return Math.max(endMins - startMins, 30);
  };

  return (
    <div className="space-y-4">
      {/* Pagination */}
      <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-2 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
        <button 
          onClick={() => setSelectedDate(prev => subDays(prev, 1))}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-600 dark:text-slate-400"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="text-center">
          <p className="text-sm font-bold text-slate-900 dark:text-white">
            {format(selectedDate, 'EEEE, MMM do')}
          </p>
          {dateKey === format(new Date(), 'yyyy-MM-dd') ? (
            <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mt-1">Today</p>
          ) : (
            <button 
              onClick={() => setSelectedDate(new Date())}
              className="text-[10px] font-bold text-blue-500 uppercase tracking-widest hover:underline mt-1"
            >
              Jump to Today
            </button>
          )}
        </div>
        <button 
          onClick={() => setSelectedDate(prev => addDays(prev, 1))}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors text-slate-600 dark:text-slate-400"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      <div 
        ref={scrollContainerRef}
        className="relative w-full h-[74vh] bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-y-auto scroll-smooth"
      >
        <div className="relative h-[1440px] w-full">
          {hours.map(h => (
            <div key={h} className="absolute w-full border-t border-slate-200 dark:border-slate-800 flex items-center" style={{ top: h * 60, height: 60 }}>
              <span className="text-[10px] text-slate-400 ml-2 -mt-[50px] w-10 text-right pr-2 font-medium">
                {h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}
              </span>
              <div className="w-full h-px bg-slate-100 dark:bg-slate-800/30"></div>
            </div>
          ))}

          {dailyTasks.map(task => {
            const top = getPosition(task.start);
            const height = getHeight(task.start, task.end);
            const styleClass = CATEGORY_COLORS[task.category] || CATEGORY_COLORS.Work;

            return (
              <div
                key={task.id}
                onClick={() => onEdit(task, dateKey)}
                className={`absolute left-14 right-2 rounded-xl border-l-4 p-3 cursor-pointer shadow-md hover:brightness-95 transition-all group ${styleClass}`}
                style={{ top, height }}
              >
                <div className="flex justify-between items-start">
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate flex-1">{task.title}</p>
                  {task.recurring && task.recurring.type !== 'none' && <Repeat size={12} className="text-slate-400 mt-0.5 ml-1" />}
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                  {format12h(task.start)} - {format12h(task.end)}
                </p>
              </div>
            );
          })}

          {/* Current Time Indicator */}
          {dateKey === format(new Date(), 'yyyy-MM-dd') && (
            <div 
              className="absolute left-14 right-0 border-t-2 border-red-500 z-10 flex items-center"
              style={{ top: getPosition(format(new Date(), 'HH:mm')) }}
            >
              <div className="w-2 h-2 bg-red-500 rounded-full -ml-1"></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
