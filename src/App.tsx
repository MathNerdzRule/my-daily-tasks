import { useState, useEffect } from 'react';
import { Camera, CameraResultType } from '@capacitor/camera';
import { Plus, Loader2, Camera as CameraIcon, Calendar as CalendarIcon, RotateCw, X, Bell, Trash2 } from 'lucide-react';
import { ThemeSwitcher } from './components/ThemeSwitcher';
import { TimelineView, Task } from './components/TimelineView';
import { parseTask, analyzeScheduleFromImage } from './services/gemini';
import { format } from 'date-fns';
import { requestNotificationPermission, scheduleTaskNotification, cancelTaskNotification } from './services/notifications';
import { Preferences } from '@capacitor/preferences';

function App() {
  const [tasks, setTasks] = useState<Task[]>(() => {
    const saved = localStorage.getItem('tasks');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading, setLoading] = useState(false);
  const [quickAdd, setQuickAdd] = useState('');
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingDate, setEditingDate] = useState<string>('');

  useEffect(() => {
    // Save to LocalStorage (Web)
    localStorage.setItem('tasks', JSON.stringify(tasks));
    // Save to Native Preferences (Widget Access)
    Preferences.set({ key: 'widget_tasks', value: JSON.stringify(tasks) });
  }, [tasks]);

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  const generateId = () => Math.floor(Math.random() * 2147483647);

  const handleQuickAdd = async () => {
    if (!quickAdd.trim()) return;
    setLoading(true);
    try {
      const taskData = await parseTask(quickAdd);
      const newTask: Task = { 
        ...taskData, 
        id: generateId(), 
        date: taskData.date || format(new Date(), 'yyyy-MM-dd'),
        reminderMinutes: 5,
        recurring: taskData.recurring || { type: 'none' },
        exceptions: []
      };
      setTasks(prev => [...prev, newTask]);
      scheduleTaskNotification(newTask);
      setQuickAdd('');
    } catch (e) {
      alert("AI Failed: " + (e as any).message);
    } finally {
      setLoading(false);
    }
  };

  const handleCamera = async () => {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Base64
      });

      if (image.base64String) {
        setLoading(true);
        const newTasksData = await analyzeScheduleFromImage(image.base64String);
        const today = format(new Date(), 'yyyy-MM-dd');
        
        const filteredNewTasks: Task[] = [];
        
        newTasksData.forEach((t: any) => {
           const taskDate = t.date || today;
           
           // Check for duplicates (same title, same start time, same date)
           const isDuplicate = tasks.some(existing => 
             existing.title.toLowerCase() === t.title.toLowerCase() && 
             existing.start === t.start && 
             existing.date === taskDate
           );

           if (!isDuplicate) {
             const nt: Task = { 
               ...t, 
               id: generateId(),
               date: taskDate,
               reminderMinutes: 5,
               recurring: { type: 'none' },
               exceptions: []
             };
             scheduleTaskNotification(nt);
             filteredNewTasks.push(nt);
           }
        });

        if (filteredNewTasks.length > 0) {
          setTasks(prev => [...prev, ...filteredNewTasks]);
        } else {
          alert("No new tasks found. All extracted events already exist.");
        }
      }
    } catch (e: any) {
      if (e.message !== 'User cancelled photos app') {
        alert("Camera Error: " + e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (id: number, dateToDelete?: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    if (task.recurring && task.recurring.type !== 'none' && dateToDelete) {
      const choice = confirm("Delete only THIS instance? (Cancel to delete the ENTIRE series)");
      if (choice) {
        // Delete only this instance (add to exceptions)
        setTasks(prev => prev.map(t => {
          if (t.id === id) {
            return { ...t, exceptions: [...(t.exceptions || []), dateToDelete] };
          }
          return t;
        }));
        setEditingTask(null);
        return;
      }
    }

    if (confirm("Delete the entire task series?")) {
      setTasks(prev => prev.filter(t => t.id !== id));
      cancelTaskNotification(id);
      setEditingTask(null);
    }
  };

  const saveEditedTask = () => {
    if (editingTask) {
      setTasks(prev => prev.map(t => t.id === editingTask.id ? editingTask : t));
      scheduleTaskNotification(editingTask);
      setEditingTask(null);
    }
  };

  const toggleDay = (day: number) => {
    if (editingTask && editingTask.recurring) {
      const currentDays = editingTask.recurring.days || [];
      const newDays = currentDays.includes(day) 
        ? currentDays.filter(d => d !== day)
        : [...currentDays, day].sort();
      setEditingTask({
        ...editingTask,
        recurring: { ...editingTask.recurring, type: 'custom', days: newDays }
      });
    }
  };

  const handleEditTask = (task: Task, date: string) => {
    setEditingTask(task);
    setEditingDate(date);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-24 font-sans">
      {/* Header with Safe Area Padding */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-6 py-4"
              style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1rem)' }}>
        <div className="flex justify-between items-center max-w-2xl mx-auto">
          <div className="flex items-center gap-2">
            <span className="text-2xl animate-pulse">✨</span>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              My Daily Tasks
            </h1>
          </div>
          <ThemeSwitcher />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Quick Add Bar */}
        <div className="flex gap-2">
          <input 
            value={quickAdd}
            onChange={e => setQuickAdd(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleQuickAdd()}
            placeholder="✨ AI Quick Add (e.g., 'Lunch at 1pm')" 
            className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3 shadow-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
          />
          <button 
            onClick={handleQuickAdd}
            disabled={loading}
            className="p-3 bg-blue-600 text-white rounded-2xl shadow-lg active:scale-95 transition-transform"
          >
            {loading ? <Loader2 className="animate-spin" /> : <RotateCw size={20} />}
          </button>
        </div>

        {/* Today Link */}
        <div className="flex justify-center">
          <button 
            onClick={() => setSelectedDate(new Date())}
            className="px-4 py-1.5 rounded-lg text-xs font-bold bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-all flex items-center gap-1"
          >
            <CalendarIcon size={12} /> Jump to Today
          </button>
        </div>

        {/* Content */}
        <TimelineView tasks={tasks} onEdit={handleEditTask} selectedDate={selectedDate} setSelectedDate={setSelectedDate} />
      </main>

      {/* Task Detail/Edit Modal */}
      {editingTask && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setEditingTask(null)}></div>
          <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-8 space-y-6 max-h-[85vh] overflow-y-auto">
              <div className="flex justify-between items-start">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Task Details</h2>
                <button onClick={() => setEditingTask(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full">
                  <X size={20} className="text-slate-400" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Title</label>
                  <input 
                    value={editingTask.title}
                    onChange={e => setEditingTask({...editingTask, title: e.target.value})}
                    className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Start</label>
                    <input 
                      type="time"
                      value={editingTask.start}
                      onChange={e => setEditingTask({...editingTask, start: e.target.value})}
                      className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">End</label>
                    <input 
                      type="time"
                      value={editingTask.end}
                      onChange={e => setEditingTask({...editingTask, end: e.target.value})}
                      className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>

                {(!editingTask.recurring || editingTask.recurring.type === 'none') && (
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Date</label>
                    <input 
                      type="date"
                      value={editingTask.date}
                      onChange={e => setEditingTask({...editingTask, date: e.target.value})}
                      className="w-full bg-slate-50 dark:bg-slate-800 border-none rounded-xl px-4 py-3 font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                )}

                {/* Recurrence Selection */}
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2 flex items-center gap-2">
                    <RotateCw size={12} /> Recurrence
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'none', label: 'None' },
                      { id: 'daily', label: 'Daily' },
                      { id: 'weekdays', label: 'Weekdays' },
                      { id: 'custom', label: 'Custom Days' }
                    ].map((type) => (
                      <button
                        key={type.id}
                        onClick={() => setEditingTask({
                          ...editingTask, 
                          recurring: { 
                            type: type.id as any, 
                            days: type.id === 'custom' ? (editingTask.recurring?.days || []) : undefined 
                          }
                        })}
                        className={`py-2 rounded-xl text-xs font-bold transition-all ${editingTask.recurring?.type === type.id ? 'bg-amber-500 text-white shadow-lg' : 'bg-slate-50 dark:bg-slate-800 text-slate-500'}`}
                      >
                        {type.label}
                      </button>
                    ))}
                  </div>

                  {editingTask.recurring?.type === 'custom' && (
                    <div className="flex justify-between mt-3 px-1">
                      {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                        <button
                          key={i}
                          onClick={() => toggleDay(i)}
                          className={`w-8 h-8 rounded-full text-[10px] font-bold transition-all ${editingTask.recurring?.days?.includes(i) ? 'bg-amber-500 text-white shadow-md' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2 flex items-center gap-2">
                    <Bell size={12} /> Reminder Before Start
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {[0, 5, 15, 30].map(mins => (
                      <button
                        key={mins}
                        onClick={() => setEditingTask({...editingTask, reminderMinutes: mins})}
                        className={`py-2 rounded-xl text-xs font-bold transition-all ${editingTask.reminderMinutes === mins ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-50 dark:bg-slate-800 text-slate-500'}`}
                      >
                        {mins === 0 ? 'None' : `${mins}m`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  onClick={() => handleDelete(editingTask.id, editingDate)}
                  className="flex-1 bg-red-50 dark:bg-red-900/20 text-red-600 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-red-100 dark:hover:bg-red-900/30 transition-all"
                >
                  <Trash2 size={18} /> Delete
                </button>
                <button 
                  onClick={saveEditedTask}
                  className="flex-[2] bg-blue-600 text-white py-4 rounded-2xl font-bold shadow-xl shadow-blue-500/40 active:scale-95 transition-all"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Action Buttons */}
      <div className="fixed bottom-8 left-0 right-0 flex justify-center items-center gap-4 px-6 pointer-events-none" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <button 
          onClick={handleCamera}
          className="pointer-events-auto bg-white dark:bg-slate-800 text-slate-900 dark:text-white p-4 rounded-full shadow-xl border border-slate-200 dark:border-slate-700 active:scale-95 transition-all"
        >
          <CameraIcon size={24} />
        </button>

        <button 
          onClick={() => document.querySelector<HTMLInputElement>('input')?.focus()}
          className="pointer-events-auto bg-blue-600 text-white p-5 rounded-full shadow-2xl shadow-blue-500/40 active:scale-95 transition-all hover:bg-blue-700"
        >
          <Plus size={32} />
        </button>
      </div>
    </div>
  );
}

export default App;
