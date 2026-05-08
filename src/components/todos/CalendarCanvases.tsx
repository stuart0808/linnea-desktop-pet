import React from "react";
import type { TodoItem } from "../../../shared/types";
import { formatDateKey, formatScheduledTime, isSameDay, getCalendarMonthDays, startOfMonth } from "../../utils/dateHelpers";
import { compareTodosForWork, getTodoTargetTime } from "../../utils/todoHelpers";
import { getCalendarDisplayDate } from "../../utils/dateHelpers";

function getTodoTime(value: string | undefined) {
  if (!value) return undefined;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : undefined;
}

function getCalendarRisk(todo: TodoItem, now: number) {
  if (todo.status !== "open") return "";
  const due = getTodoTime(todo.dueAt);
  const remind = getTodoTime(todo.remindAt);
  const scheduledStart = getTodoTime(todo.scheduledStartAt);
  const scheduledEnd = getTodoTime(todo.scheduledEndAt) ?? scheduledStart;
  if (typeof due === "number" && ((typeof scheduledStart === "number" && scheduledStart > due) || (typeof scheduledEnd === "number" && scheduledEnd > due))) {
    return "计划晚于截止";
  }
  const target = scheduledEnd ?? due ?? remind;
  if (typeof target === "number" && target <= now) return "已超过当前时间";
  return "";
}

function getCalendarMonthTodoClass(todo: TodoItem, now: number) {
  const classes = ["calendar-month-todo"];
  if (todo.status === "done") classes.push("done");
  else if (getCalendarRisk(todo, now)) classes.push("risk");
  else if (todo.scheduledStartAt) classes.push("scheduled");
  else classes.push("open");
  return classes.join(" ");
}

export function CalendarBlock({
  todo,
  now,
  selected,
  onSelect,
  onUnschedule
}: {
  todo: TodoItem;
  now: number;
  selected: boolean;
  onSelect(id: string): void;
  onUnschedule(todo: TodoItem): void;
}) {
  const risk = getCalendarRisk(todo, now);
  return (
    <button
      type="button"
      className={`calendar-block priority-${todo.priority ?? "medium"} ${risk ? "risk" : ""} ${todo.status === "done" ? "done" : ""} ${selected ? "selected" : ""}`}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(todo.id);
      }}
    >
      {risk && <b className="calendar-risk-mark" aria-label={risk}>!</b>}
      <strong>{todo.title}</strong>
      <span>{todo.isAllDayScheduled ? "全天" : formatScheduledTime(todo)}</span>
      <i
        role="button"
        tabIndex={0}
        aria-label="移回任务池"
        onClick={(event) => {
          event.stopPropagation();
          onUnschedule(todo);
        }}
      >
        ×
      </i>
    </button>
  );
}

export function CalendarTimeCanvas({
  days,
  todos,
  now,
  selectedTodoId,
  onSelectTodo,
  onSchedule,
  onUnschedule
}: {
  days: Date[];
  todos: TodoItem[];
  now: number;
  selectedTodoId: string | null;
  onSelectTodo(id: string): void;
  onSchedule(todo: TodoItem, day: Date, hour?: number, allDay?: boolean): void;
  onUnschedule(todo: TodoItem): void;
}) {
  const hours = Array.from({ length: 14 }, (_, index) => index + 8);
  const scheduledTodos = todos.filter((todo) => todo.scheduledStartAt);

  function readDraggedTodo(event: React.DragEvent) {
    const id = event.dataTransfer.getData("text/plain");
    return todos.find((todo) => todo.id === id);
  }

  return (
    <div className="calendar-time-canvas">
      <div className="calendar-time-head-spacer" />
      {days.map((day) => (
        <div key={formatDateKey(day)} className="calendar-day-heading">
          <strong>{day.toLocaleDateString(undefined, { weekday: "short" })}</strong>
          <span>{day.toLocaleDateString(undefined, { month: "2-digit", day: "2-digit" })}</span>
        </div>
      ))}
      <div className="calendar-all-day-label">全天</div>
      {days.map((day) => (
        <div
          key={`${formatDateKey(day)}-all`}
          className="calendar-all-day-cell"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const todo = readDraggedTodo(event);
            if (todo) onSchedule(todo, day, 0, true);
          }}
        >
          {scheduledTodos
            .filter((todo) => todo.isAllDayScheduled && isSameDay(new Date(todo.scheduledStartAt!), day))
            .map((todo) => (
              <CalendarBlock key={todo.id} todo={todo} now={now} selected={selectedTodoId === todo.id} onSelect={onSelectTodo} onUnschedule={onUnschedule} />
            ))}
        </div>
      ))}
      {hours.map((hour) => (
        <React.Fragment key={hour}>
          <div className="calendar-hour-label">{String(hour).padStart(2, "0")}:00</div>
          {days.map((day) => (
            <div
              key={`${formatDateKey(day)}-${hour}`}
              className="calendar-hour-cell"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const todo = readDraggedTodo(event);
                if (todo) onSchedule(todo, day, hour, false);
              }}
            >
              {scheduledTodos
                .filter((todo) => !todo.isAllDayScheduled && isSameDay(new Date(todo.scheduledStartAt!), day) && new Date(todo.scheduledStartAt!).getHours() === hour)
                .map((todo) => (
                  <CalendarBlock key={todo.id} todo={todo} now={now} selected={selectedTodoId === todo.id} onSelect={onSelectTodo} onUnschedule={onUnschedule} />
                ))}
            </div>
          ))}
        </React.Fragment>
      ))}
    </div>
  );
}

export function CalendarMonthCanvas({
  anchorDate,
  todos,
  now,
  selectedTodoId,
  onSelectTodo,
  onSelectDate
}: {
  anchorDate: Date;
  todos: TodoItem[];
  now: number;
  selectedTodoId: string | null;
  onSelectTodo(id: string): void;
  onSelectDate(date: Date): void;
}) {
  const monthStart = startOfMonth(anchorDate);
  const days = getCalendarMonthDays(monthStart);
  return (
    <div className="calendar-month-canvas">
      {["一", "二", "三", "四", "五", "六", "日"].map((day) => <span key={day} className="calendar-month-weekday">{day}</span>)}
      {days.map((day) => {
        const dayTodos = todos
          .filter((todo) => isSameDay(getCalendarDisplayDate(todo), day))
          .sort(compareTodosForWork);
        return (
          <button
            key={formatDateKey(day)}
            type="button"
            className={`calendar-month-day ${day.getMonth() === monthStart.getMonth() ? "" : "muted"} ${isSameDay(day, new Date()) ? "today" : ""}`}
            onClick={() => onSelectDate(day)}
          >
            <strong>{day.getDate()}</strong>
            <div>
              {dayTodos.slice(0, 3).map((todo) => (
                <span key={todo.id} className={`${getCalendarMonthTodoClass(todo, now)} ${selectedTodoId === todo.id ? "selected" : ""}`} onClick={(event) => {
                  event.stopPropagation();
                  onSelectTodo(todo.id);
                }}>
                  {getCalendarRisk(todo, now) && <b>!</b>}
                  {todo.title}
                </span>
              ))}
              {dayTodos.length > 3 && <small>+{dayTodos.length - 3} 更多</small>}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export { getTodoTargetTime };
