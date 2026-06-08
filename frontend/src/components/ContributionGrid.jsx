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

  // Get month labels for the grid
  const monthLabels = [];
  let currentMonth = -1;
  weeks.forEach((week, weekIndex) => {
    const month = new Date(week[0].date).getMonth();
    if (month !== currentMonth) {
      monthLabels.push({ month, weekIndex });
      currentMonth = month;
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
      <div className="bg-white border border-gray-200 rounded-2xl p-4 overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          {/* Day labels column */}
          <div className="flex flex-col gap-1 text-[10px] text-gray-400 w-6">
            <div className="h-3"></div>
            {WEEKDAYS.map((day) => (
              <div key={day} className="h-3 flex items-center justify-end pr-1">
                {day}
              </div>
            ))}
          </div>

          {/* Grid */}
          <div className="flex gap-1">
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="flex flex-col gap-1">
                {week.map((day, dayIndex) => (
                  <div
                    key={day.date}
                    className={`w-3 h-3 rounded-sm ${day.color} cursor-pointer transition-all hover:ring-2 hover:ring-green-500/50`}
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

        {/* Month labels */}
        <div className="flex gap-2 mt-2 min-w-max">
          <div className="w-6"></div>
          <div className="flex gap-1">
            {monthLabels.map(({ month, weekIndex }) => (
              <div
                key={`${month}-${weekIndex}`}
                className="text-[10px] text-gray-400"
                style={{ marginLeft: weekIndex === 0 ? 0 : `${weekIndex * 13}px` }}
              >
                {MONTHS[month]}
              </div>
            ))}
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
