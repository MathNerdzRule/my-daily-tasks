import { LocalNotifications, PendingResult } from '@capacitor/local-notifications';
import { Task } from '../components/TimelineView';
import { parse, subMinutes, getHours, getMinutes } from 'date-fns';

export async function requestNotificationPermission() {
  const perm = await LocalNotifications.checkPermissions();
  if (perm.display !== 'granted') {
    await LocalNotifications.requestPermissions();
  }
  
  await LocalNotifications.createChannel({
    id: 'task-reminders',
    name: 'Task Reminders',
    description: 'Notifications for upcoming tasks',
    importance: 5,
    visibility: 1,
    sound: 'default'
  });
}

export async function getPendingNotifications(): Promise<PendingResult> {
  return await LocalNotifications.getPending();
}

export async function scheduleTaskNotification(task: Task) {
  // Ensure channel exists
  await requestNotificationPermission();

  // Cancel any existing notifications for this task ID range
  const idsToCancel = [task.id];
  for (let i = 1; i <= 7; i++) {
    idsToCancel.push((task.id + i) % 2147483647);
  }
  await LocalNotifications.cancel({ notifications: idsToCancel.map(id => ({ id })) });

  const reminderMinutes = task.reminderMinutes ?? 5;
  if (reminderMinutes === 0) return;

  const [h, m] = task.start.split(':').map(Number);
  const taskTimeToday = new Date();
  taskTimeToday.setHours(h, m, 0, 0);
  
  const reminderTime = subMinutes(taskTimeToday, reminderMinutes);
  const rh = getHours(reminderTime);
  const rm = getMinutes(reminderTime);

  const notifications = [];

  if (task.recurring && task.recurring.type !== 'none') {
    let days: number[] = [];
    if (task.recurring.type === 'daily') days = [0,1,2,3,4,5,6];
    else if (task.recurring.type === 'weekdays') days = [1,2,3,4,5];
    else if (task.recurring.type === 'custom') days = task.recurring.days || [];

    for (const day of days) {
      notifications.push({
        title: task.title,
        body: `Starts in ${reminderMinutes}m`,
        id: (task.id + day + 1) % 2147483647,
        schedule: { 
          on: { 
            weekday: day + 1, // 1=Sun, 2=Mon...
            hour: rh, 
            minute: rm 
          },
          allowWhileIdle: true 
        },
        channelId: 'task-reminders',
        smallIcon: 'ic_stat_name', // Standard Capacitor icon name
        actionTypeId: 'OPEN_APP'
      });
    }
  } else {
    // Single task
    try {
      const taskDateTime = parse(`${task.date} ${task.start}`, 'yyyy-MM-dd HH:mm', new Date());
      const scheduleDate = subMinutes(taskDateTime, reminderMinutes);

      if (scheduleDate.getTime() > Date.now()) {
        notifications.push({
          title: task.title,
          body: `Starts in ${reminderMinutes}m`,
          id: task.id % 2147483647,
          schedule: { 
            at: scheduleDate, 
            allowWhileIdle: true 
          },
          channelId: 'task-reminders',
          actionTypeId: 'OPEN_APP'
        });
      }
    } catch (e) {
      console.error("Date parsing failed", e);
    }
  }

  if (notifications.length > 0) {
    await LocalNotifications.schedule({ notifications });
  }
}

export async function testNotificationNow() {
  await requestNotificationPermission();
  await LocalNotifications.schedule({
    notifications: [
      {
        title: "Test System",
        body: "Reminders are active!",
        id: 12345,
        schedule: { at: new Date(Date.now() + 3000) },
        channelId: 'task-reminders'
      }
    ]
  });
}

export async function cancelTaskNotification(taskId: number) {
  const idsToCancel = [taskId];
  for (let i = 1; i <= 7; i++) {
    idsToCancel.push((taskId + i) % 2147483647);
  }
  await LocalNotifications.cancel({ notifications: idsToCancel.map(id => ({ id })) });
}
