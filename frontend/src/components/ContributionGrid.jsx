import { useEffect, useState } from 'react';
import api from '../api/client.js';

// Color levels for contributions (GitHub-style green shades)
const COLOR_LEVELS = [
  'bg-gray-100',      // 0 contributions
  'bg-green-200',     // 1-2 contributions
  'bg-green-400',     // 3-5 contributions
  'bg-green-600',     // 6-10 contributions
  'bg-green-700',     // 11-20 contributions
  'bg-green-900',     // 20+ contributions
];

function getColor(count) {
  if (count === 0) return COLOR_LEVELS[0];
  if (count <= 2) return COLOR_LEVELS[1];
  if (count <= 5) return COLOR_LEVELS[2];
  if (count <= 10) return COLOR_LEVELS[3];
  if (count <= 20) return COLOR_LEVELS[4];
  return COLOR_LEVELS[5];
}

const WEEKDAYS = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

export default function ContributionGrid() {
  const [contributions, setContributions] = useState({});
  const [hoveredCell, setHoveredCell] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    loadContributions();
  }, []);

  async function loadContributions() {
    try {
      const r = await api.get('/profile/contributions');
      const map = {};
      r.data.contributions.forEach(c => {
        map[c.date] = c.count;
      });
      setContributions(map);
    } catch (e) {
      console.error('Failed to load contributions:', e);
    }
  }

  // Generate the grid for the last 52 weeks (1 year)
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 364); // Go back 52 weeks

  const weeks = [];
  let currentDate = new Date(startDate);
  
  // Adjust to Sunday
  currentDate.setDate(currentDate.getDate() - currentDate.getDay());

  while (currentDate <= today) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      const dateStr = currentDate.toISOString().slice(0, 10);
      const count = contributions[dateStr] || 0;
      week.push({
        date: dateStr,
        count,
        color: getColor(count),
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }
    weeks.push(week);
  }

  // Get month labels for the grid — one per month, in order. Keep only the
  // first occurrence of each month so the boundary month (the window spans ~52
  // weeks, e.g. Jun → Jun) isn't repeated at both ends.
  const monthLabels = [];
  const seenMonths = new Set();
  let currentMonth = -1;
  weeks.forEach((week, weekIndex) => {
    const month = new Date(week[0].date).getMonth();
    if (month !== currentMonth) {
      currentMonth = month;
      if (!seenMonths.has(month)) {
        seenMonths.add(month);
        monthLabels.push({ month, weekIndex });
      }
    }
  });

  const handleMouseEnter = (day, e) => {
    setHoveredCell(day);
    setTooltipPosition({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e) => {
    setTooltipPosition({ x: e.clientX, y: e.clientY });
  };

  return (
    <div className="mt-6">
      <h3 className="text-sm font-bold text-gray-700 mb-3">مساهماتك</h3>
      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <div dir="ltr" className="w-full">
          {/* Month labels — each label spans its month's share of the year, so
              the 12 months are evenly distributed and sorted across the width. */}
          <div className="flex gap-1">
            <div className="w-6 shrink-0"></div>
            <div className="relative h-4 flex-1 min-w-0">
              {monthLabels.map(({ month, weekIndex }) => (
                <div
                  key={`${month}-${weekIndex}`}
                  className="absolute top-0 text-[10px] text-gray-400 whitespace-nowrap"
                  style={{ left: `${(weekIndex / weeks.length) * 100}%` }}
                >
                  {MONTHS[month]}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-1">
            {/* Day labels column — rows stretch to match the cell heights */}
            <div className="flex flex-col gap-1 text-[10px] text-gray-400 w-6 shrink-0">
              {WEEKDAYS.map((day) => (
                <div key={day} className="flex-1 flex items-center justify-end pr-1">
                  {day}
                </div>
              ))}
            </div>

            {/* Grid — 52 week columns sharing the full width equally; each cell
                is square (aspect-square) so the squares grow to fill the space. */}
            <div className="flex gap-1 flex-1 min-w-0">
              {weeks.map((week, weekIndex) => (
                <div key={weekIndex} className="flex flex-col gap-1 flex-1 min-w-0">
                  {week.map((day) => (
                    <div
                      key={day.date}
                      className={`w-full aspect-square rounded-sm border border-gray-200/60 ${day.color} cursor-pointer transition-all hover:ring-2 hover:ring-green-500/50`}
                      onMouseEnter={(e) => handleMouseEnter(day, e)}
                      onMouseLeave={() => setHoveredCell(null)}
                      onMouseMove={handleMouseMove}
                      title={`${day.date}: ${day.count} مساهمة`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-end gap-2 mt-3 text-[10px] text-gray-400">
          <span>أقل</span>
          {COLOR_LEVELS.map((color, index) => (
            <div key={index} className={`w-3 h-3 rounded-sm ${color}`} />
          ))}
          <span>أكثر</span>
        </div>

        {/* Tooltip */}
        {hoveredCell && (
          <div 
            className="fixed bg-gray-900 text-white text-xs px-2 py-1 rounded shadow-lg pointer-events-none z-50"
            style={{
              left: tooltipPosition.x + 10,
              top: tooltipPosition.y - 40,
            }}
          >
            {new Date(hoveredCell.date).toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            <br />
            {hoveredCell.count} مساهمة
          </div>
        )}
      </div>
    </div>
  );
}
