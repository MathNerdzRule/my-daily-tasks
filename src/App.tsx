import React, { useState, useEffect, useRef } from 'react';
import { Camera, CameraResultType } from '@capacitor/camera';
import { Preferences } from '@capacitor/preferences';
import { 
  Camera as CameraIcon, 
  Loader2, 
  Calendar as CalendarIcon, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Info, 
  Clock, 
  ArrowRight 
} from 'lucide-react';
import { ThemeSwitcher } from './components/ThemeSwitcher';
import { EventListView, StoredEvent } from './components/EventListView';
import { 
  analyzeScheduleFromImage, 
  getSampleImages, 
  SampleImageInfo,
  ParsedEvent 
} from './services/gemini';
import { format } from 'date-fns';

interface ConfirmDialogState {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
}

interface ScanResultModalState {
  modelUsed: string;
  addedCount: number;
  duplicateCount: number;
  events: ParsedEvent[];
  previewUrl?: string;
}

export function App() {
  const [events, setEvents] = useState<StoredEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [progressStep, setProgressStep] = useState<string | null>(null);
  const [notificationToast, setNotificationToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [scanResult, setScanResult] = useState<ScanResultModalState | null>(null);
  const [sampleImages, setSampleImages] = useState<SampleImageInfo[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<any>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setNotificationToast({ message, type });
    toastTimerRef.current = setTimeout(() => {
      setNotificationToast(null);
    }, 4500);
  };

  const generateId = () => 'evt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);

  // Load sample images and initial stored events
  useEffect(() => {
    getSampleImages().then(samples => {
      if (samples && samples.length > 0) {
        setSampleImages(samples);
      }
    });

    try {
      const saved = localStorage.getItem('stored_calendar_events');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setEvents(parsed);
          return;
        }
      }

      // Check legacy 'tasks' if existing
      const legacy = localStorage.getItem('tasks');
      if (legacy) {
        const legacyParsed = JSON.parse(legacy);
        if (Array.isArray(legacyParsed) && legacyParsed.length > 0) {
          const migrated: StoredEvent[] = legacyParsed.map((t: any) => ({
            id: String(t.id || generateId()),
            title: t.title || 'Untitled Event',
            date: t.date || format(new Date(), 'yyyy-MM-dd'),
            start: t.start || '09:00',
            end: t.end || '10:00',
            location: t.category === 'Work' ? 'Office' : undefined,
            notes: t.category,
            capturedAt: Date.now(),
          }));
          setEvents(migrated);
          return;
        }
      }
    } catch (e) {
      console.warn('Failed to load stored events', e);
    }
  }, []);

  // Sync to local storage & Capacitor preferences
  useEffect(() => {
    localStorage.setItem('stored_calendar_events', JSON.stringify(events));
    Preferences.set({ key: 'stored_calendar_events', value: JSON.stringify(events) }).catch(() => {});
  }, [events]);

  // Clean title for deduplication comparison
  const normalizeTitle = (title: string) => {
    return title
      .toLowerCase()
      .replace(/^(fw:|re:)\s*/i, '')
      .replace(/microsoft teams meeting|teams meeting/gi, '')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  /**
   * Process parsed events from Gemini 3.8 Flash and de-duplicate against existing store
   */
  const handleParsedEvents = (parsedList: ParsedEvent[], modelUsed: string, previewUrl?: string) => {
    if (!Array.isArray(parsedList) || parsedList.length === 0) {
      showToast('No calendar events or timestamps could be identified in the image.', 'info');
      return;
    }

    let addedCount = 0;
    let duplicateCount = 0;
    const newItems: StoredEvent[] = [];
    const updatedStore = [...events];

    for (const item of parsedList) {
      const itemTitleNorm = normalizeTitle(item.title);

      // Check if an event already exists with matching date and start time (or closely overlapping)
      const existingIndex = updatedStore.findIndex(existing => {
        if (existing.date !== item.date) return false;

        const existingNorm = normalizeTitle(existing.title);
        const titlesMatch = existingNorm === itemTitleNorm || 
                            existingNorm.includes(itemTitleNorm) || 
                            itemTitleNorm.includes(existingNorm);

        // Same start time or titles match exactly on the same date
        if (titlesMatch && existing.start === item.start) return true;
        if (titlesMatch && Math.abs(Number(existing.start.replace(':', '')) - Number(item.start.replace(':', ''))) <= 15) return true;

        return false;
      });

      if (existingIndex >= 0) {
        // Already exists: enrich if incoming has better details
        duplicateCount++;
        const current = updatedStore[existingIndex];
        updatedStore[existingIndex] = {
          ...current,
          end: item.end || current.end,
          location: item.location || current.location,
          notes: item.notes ? (current.notes ? `${current.notes} • ${item.notes}` : item.notes) : current.notes,
        };
      } else {
        // Brand new event
        addedCount++;
        const newEvent: StoredEvent = {
          id: generateId(),
          title: item.title,
          date: item.date,
          start: item.start || '09:00',
          end: item.end || '10:00',
          location: item.location || '',
          notes: item.notes || '',
          category: item.category || 'Meeting',
          capturedAt: Date.now(),
        };
        newItems.push(newEvent);
        updatedStore.push(newEvent);
      }
    }

    setEvents(updatedStore);

    setScanResult({
      modelUsed,
      addedCount,
      duplicateCount,
      events: parsedList,
      previewUrl,
    });

    if (addedCount > 0) {
      showToast(`Added ${addedCount} event${addedCount > 1 ? 's' : ''}! (${duplicateCount} duplicate${duplicateCount === 1 ? '' : 's'} skipped)`, 'success');
    } else {
      showToast(`All ${duplicateCount} event${duplicateCount === 1 ? '' : 's'} already exist locally. No duplicates added.`, 'info');
    }
  };

  /**
   * Fast client-side image compression using Canvas to ensure fast uploads to Gemini
   */
  const compressImage = async (fileOrUrl: File | string, maxDimension = 1600): Promise<{ base64: string; previewUrl: string }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context not available'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        const cleanBase64 = dataUrl.split(',')[1];
        resolve({ base64: cleanBase64, previewUrl: dataUrl });
      };
      img.onerror = () => reject(new Error('Failed to load image for processing'));

      if (typeof fileOrUrl === 'string') {
        img.src = fileOrUrl;
      } else {
        img.src = URL.createObjectURL(fileOrUrl);
      }
    });
  };

  /**
   * Scan image using Camera or File input
   */
  const handleScanWithCamera = async () => {
    try {
      const image = await Camera.getPhoto({
        quality: 85,
        width: 1600,
        allowEditing: false,
        resultType: CameraResultType.Base64,
      });

      if (image.base64String) {
        await processBase64Image(image.base64String, 'image/jpeg');
      }
    } catch {
      // In web browser or when camera permission is unavailable, trigger file picker
      if (fileInputRef.current) {
        fileInputRef.current.click();
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setProgressStep('Preparing image...');
    try {
      const { base64, previewUrl } = await compressImage(file, 1600);
      await processBase64Image(base64, 'image/jpeg', previewUrl);
    } catch (err: any) {
      showToast('Could not load image: ' + err.message, 'error');
      setLoading(false);
      setProgressStep(null);
    }
    e.target.value = '';
  };

  const processBase64Image = async (base64String: string, mimeType: string, previewUrl?: string) => {
    setLoading(true);
    setProgressStep('Analyzing schedule image with Gemini 3.8 Flash...');

    try {
      const result = await analyzeScheduleFromImage(base64String, mimeType);
      setProgressStep('Filtering duplicates and saving events locally...');
      handleParsedEvents(result.events, result.modelUsed, previewUrl);
    } catch (err: any) {
      console.error(err);
      showToast('Image parsing failed: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      setLoading(false);
      setProgressStep(null);
    }
  };

  /**
   * Instant 1-tap testing with the sample images attached by user
   */
  const handleTestSample = async (sample: SampleImageInfo) => {
    setLoading(true);
    setProgressStep(`Preparing "${sample.title}"...`);

    try {
      const { base64, previewUrl } = await compressImage(sample.url, 1600);
      setProgressStep(`Analyzing "${sample.title}" with Gemini 3.8 Flash...`);
      const result = await analyzeScheduleFromImage(base64, 'image/jpeg');
      setProgressStep('Filtering duplicates and storing events locally...');
      handleParsedEvents(result.events, result.modelUsed, previewUrl);
    } catch (err: any) {
      console.error(err);
      showToast('Sample analysis failed: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      setLoading(false);
      setProgressStep(null);
    }
  };

  const handleDeleteEvent = (id: string) => {
    const event = events.find(e => e.id === id);
    if (!event) return;

    setConfirmDialog({
      title: 'Delete Event',
      message: `Are you sure you want to delete "${event.title}" from your locally stored schedule?`,
      confirmLabel: 'Delete Event',
      onConfirm: () => {
        setEvents(prev => prev.filter(e => e.id !== id));
        setConfirmDialog(null);
        showToast('Event removed', 'info');
      },
    });
  };

  const handleClearAll = () => {
    setConfirmDialog({
      title: 'Clear All Events',
      message: `This will remove all ${events.length} locally stored events. Are you sure?`,
      confirmLabel: 'Clear All',
      onConfirm: () => {
        setEvents([]);
        localStorage.removeItem('stored_calendar_events');
        setConfirmDialog(null);
        showToast('All events cleared', 'info');
      },
    });
  };

  return (
    <div className="min-h-screen bg-[#FDFCFE] dark:bg-[#111318] text-[#1A1C1E] dark:text-[#E2E2E6] pb-28 font-sans transition-colors duration-200">
      {/* Hidden file input for photo/screenshot selection */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept="image/*"
        className="hidden"
      />

      {/* Material You Top App Bar */}
      <header className="sticky top-0 z-40 bg-[#FDFCFE]/90 dark:bg-[#111318]/90 backdrop-blur-md border-b border-slate-200/60 dark:border-white/5 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#D9E3F8] dark:bg-[#3C4758] text-[#00639B] dark:text-[#92CCFF] flex items-center justify-center shadow-sm">
              <CameraIcon size={20} />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
                My Daily Tasks
              </h1>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Photo Schedule Lens • Gemini 3.8 Flash
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex text-xs font-semibold text-slate-500 dark:text-slate-400 bg-[#EEF1F6] dark:bg-[#282A30] px-3 py-1 rounded-full">
              {events.length} stored
            </span>
            <ThemeSwitcher />
          </div>
        </div>
      </header>

      {/* Floating Notification Toast */}
      {notificationToast && (
        <div className="fixed top-20 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none animate-in fade-in slide-in-from-top-2 duration-200">
          <div className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl shadow-lg max-w-md w-full border ${
            notificationToast.type === 'error'
              ? 'bg-red-50 dark:bg-red-950/90 border-red-200 dark:border-red-900 text-red-800 dark:text-red-200'
              : notificationToast.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/90 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200'
              : 'bg-[#D9E3F8] dark:bg-[#3C4758] border-transparent text-[#101C2B] dark:text-[#D9E3F8]'
          }`}>
            {notificationToast.type === 'error' && <AlertCircle size={18} className="shrink-0 text-red-600 dark:text-red-400" />}
            {notificationToast.type === 'success' && <CheckCircle2 size={18} className="shrink-0 text-emerald-600 dark:text-emerald-400" />}
            {notificationToast.type === 'info' && <Info size={18} className="shrink-0 text-[#00639B] dark:text-[#92CCFF]" />}
            <span className="text-xs font-semibold flex-1 leading-snug">{notificationToast.message}</span>
            <button
              onClick={() => setNotificationToast(null)}
              className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-full"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Material 3 Schedule Capture Card */}
        <section className="bg-white dark:bg-[#1E2025] rounded-[28px] p-5 sm:p-6 border border-slate-200/80 dark:border-white/5 shadow-sm space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-[#E8F1FC] dark:bg-[#004A74]/50 text-[#00639B] dark:text-[#92CCFF]">
                  AI Schedule Scanner
                </span>
                <span className="text-[11px] font-medium text-slate-400">Gemini 3.8 Flash</span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mt-1">
                Capture Calendar or Single Event
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Take a photo of your screen to read schedule dates and times. Automatically extracts single timestamps and multi-day weekly views, ignoring duplicate events.
              </p>
            </div>
          </div>

          {/* Quick Capture Button */}
          <div className="pt-1">
            <button
              onClick={handleScanWithCamera}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2.5 bg-[#00639B] hover:bg-[#005180] dark:bg-[#92CCFF] dark:hover:bg-[#B3DBFF] text-white dark:text-[#003353] py-3.5 px-6 rounded-full font-bold text-sm shadow-md active:scale-95 transition-all"
            >
              <CameraIcon size={19} />
              <span>Take Photo</span>
            </button>
          </div>

          {/* One-Click Sample Testing (from user's uploaded images) */}
          {sampleImages.length > 0 && (
            <div className="pt-2 border-t border-slate-100 dark:border-white/5 space-y-2">
              <span className="text-[11px] font-semibold text-slate-400 block">
                Quick test with your screen captures:
              </span>
              <div className="flex flex-col sm:flex-row gap-2">
                {sampleImages.map((sample) => (
                  <button
                    key={sample.id}
                    onClick={() => handleTestSample(sample)}
                    disabled={loading}
                    className="flex-1 flex items-center justify-between p-2.5 rounded-2xl bg-[#F8FAFC] dark:bg-[#282A30]/60 hover:bg-[#EFF3FA] dark:hover:bg-[#32353C] border border-slate-200/60 dark:border-white/5 transition-all text-left group"
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                        {sample.id === 'week-schedule' ? <CalendarIcon size={16} /> : <Clock size={16} />}
                      </div>
                      <div className="truncate">
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                          {sample.title}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate">
                          {sample.description}
                        </p>
                      </div>
                    </div>
                    <ArrowRight size={14} className="text-slate-400 group-hover:translate-x-0.5 transition-transform shrink-0 ml-2" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Saved Events List */}
        <section className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Stored Events ({events.length})
            </h3>
            {events.length > 0 && (
              <span className="text-xs text-slate-400 font-medium">
                Saved locally on this device
              </span>
            )}
          </div>

          <EventListView
            events={events}
            onDeleteEvent={handleDeleteEvent}
            onClearAll={handleClearAll}
          />
        </section>
      </main>

      {/* Loading & Scanning Modal */}
      {loading && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#1E2025] rounded-[32px] p-8 shadow-2xl flex flex-col items-center gap-5 max-w-sm w-full border border-slate-200 dark:border-white/10 text-center">
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-[#E8F1FC] dark:bg-[#004A74]/50 flex items-center justify-center text-[#00639B] dark:text-[#92CCFF] animate-pulse">
                <Loader2 size={32} className="animate-spin" />
              </div>
            </div>
            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Reading Image...
              </h3>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {progressStep || 'Gemini 3.8 Flash is extracting schedule events...'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Scan Summary Dialog */}
      {scanResult && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setScanResult(null)}
          ></div>
          <div className="relative w-full max-w-md bg-white dark:bg-[#1E2025] rounded-[32px] p-6 shadow-2xl border border-slate-200 dark:border-white/10 space-y-4 max-h-[85vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold text-[#00639B] dark:text-[#92CCFF] uppercase tracking-wider bg-[#E8F1FC] dark:bg-[#004A74]/50 px-2.5 py-0.5 rounded-full">
                  Scan Complete • {scanResult.modelUsed}
                </span>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                  Schedule Extracted
                </h3>
              </div>
              <button
                onClick={() => setScanResult(null)}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#282A30]"
              >
                <X size={18} />
              </button>
            </div>

            {/* Results Pill Stats */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-[#E8F1FC] dark:bg-[#004A74]/40 p-3 rounded-2xl text-center">
                <p className="text-xl font-bold text-[#00639B] dark:text-[#92CCFF]">
                  {scanResult.addedCount}
                </p>
                <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  New Events Added
                </p>
              </div>
              <div className="bg-[#EEF1F6] dark:bg-[#282A30] p-3 rounded-2xl text-center">
                <p className="text-xl font-bold text-slate-700 dark:text-slate-200">
                  {scanResult.duplicateCount}
                </p>
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  Duplicates Skipped
                </p>
              </div>
            </div>

            {/* Scanned Items List */}
            <div className="space-y-2 pt-1">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Recognized Items ({scanResult.events.length})
              </p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {scanResult.events.map((ev, i) => (
                  <div 
                    key={i} 
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-[#282A30]/60 border border-slate-100 dark:border-white/5 text-xs"
                  >
                    <div className="truncate mr-2">
                      <p className="font-bold text-slate-800 dark:text-slate-200 truncate">{ev.title}</p>
                      <p className="text-[10px] text-slate-400">
                        {ev.date} • {ev.start} - {ev.end}
                      </p>
                    </div>
                    <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => setScanResult(null)}
              className="w-full bg-[#00639B] hover:bg-[#005180] dark:bg-[#92CCFF] dark:hover:bg-[#B3DBFF] text-white dark:text-[#003353] py-3 rounded-full font-bold text-xs shadow-md transition-all active:scale-95"
            >
              Done & View Schedule
            </button>
          </div>
        </div>
      )}

      {/* In-app Confirmation Modal */}
      {confirmDialog && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setConfirmDialog(null)}
          ></div>
          <div className="relative w-full max-w-sm bg-white dark:bg-[#1E2025] rounded-[32px] p-6 shadow-2xl border border-slate-200 dark:border-white/10 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              {confirmDialog.title}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {confirmDialog.message}
            </p>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setConfirmDialog(null)}
                className="flex-1 bg-slate-100 dark:bg-[#282A30] hover:bg-slate-200 dark:hover:bg-[#32353C] text-slate-700 dark:text-slate-300 py-2.5 rounded-full font-bold text-xs transition-all"
              >
                Cancel
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-full font-bold text-xs shadow-md shadow-red-600/20 active:scale-95 transition-all"
              >
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
