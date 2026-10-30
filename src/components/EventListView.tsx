import React, { useState, useMemo } from 'react';
import { Search, Clock, MapPin, Trash2, Copy, Check, Calendar, X } from 'lucide-react';
import { format, parseISO, isToday, isThisWeek } from 'date-fns';

export interface StoredEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  start: string; // HH:mm (24h)
  end: string; // HH:mm (24h)
  location?: string;
  notes?: string;
  category?: string;
  capturedAt: number;
}

interface EventListViewProps {
  events: StoredEvent[];
  onDeleteEvent: (id: string) => void;
  onClearAll: () => void;
}

export const EventListView: React.FC<EventListViewProps> = ({
  events,
  onDeleteEvent,
  onClearAll,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'today' | 'week' | 'upcoming'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Time formatting helper
  const formatTime12h = (time24: string) => {
    if (!time24) return '';
    const parts = time24.split(':').map(Number);
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return time24;
    const [h, m] = parts;
    const hour = h % 12 || 12;
    const ampm = h < 12 ? 'AM' : 'PM';
    return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
  };

  const getDurationString = (start: string, end: string) => {
    if (!start || !end) return '';
    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    if (isNaN(h1) || isNaN(m1) || isNaN(h2) || isNaN(m2)) return '';
    const startMins = h1 * 60 + m1;
    let endMins = h2 * 60 + m2;
    if (endMins < startMins) endMins += 24 * 60; // overnight
    const diff = endMins - startMins;
    if (diff <= 0) return '';
    if (diff < 60) return `${diff}m`;
    const hours = Math.floor(diff / 60);
    const mins = diff % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  // Filter and search
  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      // Search matching
      const matchesSearch = !searchQuery.trim() || 
        event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (event.location && event.location.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (event.notes && event.notes.toLowerCase().includes(searchQuery.toLowerCase())) ||
        event.date.includes(searchQuery);

      if (!matchesSearch) return false;

      // Filter matching
      if (activeFilter === 'all') return true;

      try {
        const eventDateObj = parseISO(event.date + 'T00:00:00');
        if (activeFilter === 'today') {
          return isToday(eventDateObj);
        }
        if (activeFilter === 'week') {
          return isThisWeek(eventDateObj, { weekStartsOn: 1 });
        }
        if (activeFilter === 'upcoming') {
          const now = new Date();
          const todayStr = format(now, 'yyyy-MM-dd');
          return event.date >= todayStr;
        }
      } catch {
        return true;
      }

      return true;
    });
  }, [events, searchQuery, activeFilter]);

  // Group events by date
  const groupedByDate = useMemo(() => {
    const groups: { [dateStr: string]: StoredEvent[] } = {};

    // Sort by date then start time
    const sorted = [...filteredEvents].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.start.localeCompare(b.start);
    });

    for (const event of sorted) {
      if (!groups[event.date]) {
        groups[event.date] = [];
      }
      groups[event.date].push(event);
    }

    return Object.entries(groups).map(([dateStr, items]) => ({
      dateStr,
      items,
    }));
  }, [filteredEvents]);

  const handleCopy = (event: StoredEvent) => {
    const text = `${event.title} • ${event.date} • ${formatTime12h(event.start)} - ${formatTime12h(event.end)}${event.location ? ` • ${event.location}` : ''}`;
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedId(event.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const formatDateHeader = (dateStr: string) => {
    try {
      const parsed = parseISO(dateStr + 'T00:00:00');
      const isTod = isToday(parsed);
      const formatted = format(parsed, 'EEEE, MMMM d, yyyy');
      return { formatted, isTod };
    } catch {
      return { formatted: dateStr, isTod: false };
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Search & Filter Bar */}
      <div className="space-y-3">
        {/* Material 3 Search Bar */}
        <div className="relative flex items-center">
          <div className="absolute left-4 text-slate-400 dark:text-slate-500 pointer-events-none">
            <Search size={18} />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search events, meetings, or dates..."
            className="w-full bg-[#EEF1F6] dark:bg-[#1E2024] text-[#191C1E] dark:text-[#E2E2E6] placeholder-slate-400 dark:placeholder-slate-500 pl-11 pr-10 py-3 rounded-full border border-transparent focus:border-[#00639B] dark:focus:border-[#92CCFF] focus:bg-white dark:focus:bg-[#282A2F] text-sm font-medium outline-none transition-all shadow-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Material 3 Filter Chips */}
        <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 no-scrollbar">
          <div className="flex items-center gap-1.5">
            {[
              { id: 'all', label: 'All' },
              { id: 'today', label: 'Today' },
              { id: 'week', label: 'This Week' },
              { id: 'upcoming', label: 'Upcoming' },
            ].map((filter) => {
              const isActive = activeFilter === filter.id;
              return (
                <button
                  key={filter.id}
                  onClick={() => setActiveFilter(filter.id as any)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all border ${
                    isActive
                      ? 'bg-[#00639B] dark:bg-[#92CCFF] border-transparent text-white dark:text-[#003353] shadow-sm'
                      : 'bg-white dark:bg-[#1E2024] border-slate-200/80 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#282A30]'
                  }`}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>

          {events.length > 0 && (
            <button
              onClick={onClearAll}
              className="text-[11px] font-semibold text-slate-400 hover:text-red-500 dark:hover:text-red-400 whitespace-nowrap px-2 py-1 rounded-lg transition-colors"
            >
              Clear All ({events.length})
            </button>
          )}
        </div>
      </div>

      {/* Events Feed */}
      {groupedByDate.length === 0 ? (
        <div className="p-8 text-center bg-white dark:bg-[#1E2025] rounded-[28px] border border-slate-200/80 dark:border-white/5 shadow-sm space-y-3">
          <div className="w-14 h-14 mx-auto rounded-full bg-[#EEF2F9] dark:bg-[#282A30] text-[#00639B] dark:text-[#92CCFF] flex items-center justify-center">
            <Calendar size={28} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {events.length === 0 ? 'No events saved yet' : 'No matching events found'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto mt-1">
              {events.length === 0 
                ? 'Take a photo of your schedule screen or single event timestamp above. Claude Sonnet 5.5 will parse and store them locally.'
                : 'Try adjusting your search query or switching to the "All" filter.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedByDate.map(({ dateStr, items }) => {
            const { formatted, isTod } = formatDateHeader(dateStr);

            return (
              <div key={dateStr} className="space-y-2.5">
                {/* Date Header Chip */}
                <div className="flex items-center gap-2 px-1">
                  <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold ${
                    isTod 
                      ? 'bg-[#00639B] text-white dark:bg-[#92CCFF] dark:text-[#003353] shadow-sm' 
                      : 'bg-[#EEF1F6] dark:bg-[#282A30] text-slate-700 dark:text-slate-200'
                  }`}>
                    <Calendar size={13} />
                    <span>{formatted}</span>
                    {isTod && <span className="uppercase text-[9px] tracking-wider ml-1 bg-white/20 dark:bg-black/20 px-1.5 py-0.5 rounded-full">Today</span>}
                  </div>
                  <span className="text-[11px] font-semibold text-slate-400">
                    {items.length} {items.length === 1 ? 'event' : 'events'}
                  </span>
                </div>

                {/* Event Cards */}
                <div className="space-y-2">
                  {items.map((event) => {
                    const duration = getDurationString(event.start, event.end);

                    return (
                      <div
                        key={event.id}
                        className="group bg-white dark:bg-[#1E2025] hover:bg-[#FAFBFD] dark:hover:bg-[#23262C] rounded-[24px] p-4 border border-slate-200/80 dark:border-white/5 shadow-sm transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        {/* Event Left / Content */}
                        <div className="space-y-1.5 flex-1 min-w-0">
                          {/* Time range badge */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#00639B] dark:text-[#92CCFF] bg-[#E8F1FC] dark:bg-[#004A74]/50 px-2.5 py-1 rounded-full">
                              <Clock size={13} />
                              <span>{formatTime12h(event.start)} – {formatTime12h(event.end)}</span>
                            </span>

                            {duration && (
                              <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">
                                {duration}
                              </span>
                            )}

                            {event.location && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-[#2A2D34] px-2 py-0.5 rounded-full truncate max-w-[180px]">
                                <MapPin size={11} className="text-slate-400 shrink-0" />
                                <span className="truncate">{event.location}</span>
                              </span>
                            )}
                          </div>

                          {/* Title */}
                          <h4 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-tight break-words">
                            {event.title}
                          </h4>

                          {/* Notes / Details */}
                          {event.notes && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                              {event.notes}
                            </p>
                          )}
                        </div>

                        {/* Event Actions */}
                        <div className="flex items-center gap-1 self-end sm:self-center shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-white/5 w-full sm:w-auto justify-end">
                          <button
                            onClick={() => handleCopy(event)}
                            title="Copy event summary"
                            className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#282A30] rounded-full transition-colors flex items-center gap-1 text-xs font-medium"
                          >
                            {copiedId === event.id ? (
                              <>
                                <Check size={15} className="text-emerald-500" />
                                <span className="text-emerald-600 dark:text-emerald-400 sm:hidden">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy size={15} />
                                <span className="sm:hidden">Copy</span>
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => onDeleteEvent(event.id)}
                            title="Delete this event"
                            className="p-2 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-full transition-colors flex items-center gap-1 text-xs font-medium"
                          >
                            <Trash2 size={15} />
                            <span className="sm:hidden">Delete</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
