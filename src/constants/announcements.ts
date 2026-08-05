import { announcementsConfig } from '@lib/config/site';
import type { Announcement } from '@/types/announcement';

/**
 * Site Announcements Configuration
 *
 * Announcements are loaded from config/site.yaml
 * They will automatically appear based on their startDate/endDate settings.
 */
export const announcements: Announcement[] = announcementsConfig.map((a) => ({
  id: a.id,
  title: a.title,
  content: a.content,
  type: a.type,
  publishDate: a.publishDate,
  startDate: a.startDate,
  endDate: a.endDate,
  priority: a.priority,
  link: a.link,
  color: a.color,
}));
