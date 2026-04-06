export async function getWaitlist(api, room) {
  if (!api?.room?.getWaitlist) return [];
  const res = await api.room.getWaitlist(room);
  const waitlist = res?.data?.data?.waitlist ?? res?.data?.waitlist ?? [];
  return Array.isArray(waitlist) ? waitlist : [];
}
