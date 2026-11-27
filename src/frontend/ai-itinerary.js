/* Merge one validated intent into a draft. The live map changes only after replay succeeds. */
export function mergeManualStops(draft, previous, current) {
  const previousIds = new Set(previous.map(({ id }) => id));
  const currentIds = new Set(current.map(({ id }) => id));
  const replacedCities = new Set([
    ...previous.filter(({ id }) => !currentIds.has(id)),
    ...current.filter(({ id }) => !previousIds.has(id)),
  ].map(({ city }) => city.cityId));
  const existing = new Map(draft.stops.filter(({ id }) => id != null).map((node) => [node.id, node]));
  const currentStops = current.slice(1, -1);
  const visibleIds = new Set(currentStops.map(({ id }) => id));
  const visible = currentStops.map((node) => existing.get(node.id) ?? node).values();
  const stops = [];
  // Keep draft-only stops in their slots while applying the edited order to visible stops.
  for (const stop of draft.stops) {
    if (previousIds.has(stop.id)) {
      if (!visibleIds.has(stop.id)) continue;
      const next = visible.next();
      if (!next.done) stops.push(next.value);
    } else if (!replacedCities.has(stop.city.cityId)) {
      stops.push(stop);
    }
  }
  stops.push(...visible);
  return { stops, pendingStops: draft.pendingStops.filter(({ key }) => !replacedCities.has(key)) };
}

function stopInsertionIndex(draft, change, currentStop, resolvePlace) {
  if (!change.position) return currentStop ? draft.stops.indexOf(currentStop) : draft.stops.length;
  if (!change.relativeTo) return null;
  const reference = resolvePlace(change.relativeTo);
  if (!reference) return null;

  const ordered = [draft.origin, ...draft.stops, draft.destination];
  const matches = ordered.filter((node) => node?.city.cityId === reference.city.cityId &&
    (!reference.arrivalStopId || node.arrivalStopId === reference.arrivalStopId || node.departureStopId === reference.arrivalStopId));
  if (matches.length !== 1 || matches[0] === currentStop) return null;
  const index = ordered.indexOf(matches[0]) - (change.position === "BEFORE" ? 1 : 0);
  if (index < 0 || index > draft.stops.length) return null;
  const old = draft.stops.indexOf(currentStop);
  return old >= 0 && old < index ? index - 1 : index;
}

export function mergeIntent(current, intent, resolvePlace) {
  const draft = {
    ...current, stops: [...current.stops], pendingStops: [...(current.pendingStops ?? [])],
    unresolved: { ...current.unresolved },
  };
  function endpoint(field, place) {
    const node = resolvePlace(place);
    if (!node) {
      draft.unresolved[field] = place;
      return;
    }
    delete draft.unresolved[field];
    const previous = draft[field];
    draft[field] = previous?.city.cityId === node.city.cityId ? { ...previous, ...node } : node;
  }
  if (intent.origin) endpoint("origin", intent.origin);
  if (intent.destination) {
    draft.suggestion = null;
    endpoint("destination", intent.destination);
  } else if (intent.region) {
    const node = intent.suggestedCity && resolvePlace(intent.suggestedCity, true);
    const requiresChoice = Boolean((draft.destination && !draft.suggestion?.applied) || !node);
    draft.suggestion = { region: intent.region, node, applied: !requiresChoice };
    delete draft.unresolved.destination;
    if (!requiresChoice) draft.destination = node;
  }

  for (const update of intent.stops) {
    const node = resolvePlace(update.place);
    const key = node?.city.cityId ?? update.place;
    const pending = draft.pendingStops.find((item) => item.key === key || item.place === update.place);
    draft.pendingStops = draft.pendingStops.filter((item) => item.key !== key && item.place !== update.place);
    if (update.action === "CLEAR") continue;
    const change = update.action === "STOP" && pending ? {
      ...update, stayDays: update.stayDays ?? pending.stayDays,
      position: update.position ?? pending.position, relativeTo: update.position ? update.relativeTo : pending.relativeTo,
    } : update;
    const matches = draft.stops.filter((stop) => stop.city.cityId === key);
    if (!node || matches.length > 1 || ["UNCLEAR", "PASS", "TRANSFER"].includes(change.action)) {
      draft.pendingStops.push({ ...change, key, ambiguousPlace: !node || matches.length > 1 });
    } else if (change.action === "REMOVE") {
      draft.stops = draft.stops.filter((stop) => stop.city.cityId !== key);
    } else {
      const existing = matches[0];
      const index = stopInsertionIndex(draft, change, existing, resolvePlace);
      if (index == null) {
        draft.pendingStops.push({ ...change, key, ambiguousPosition: true });
        continue;
      }
      if (existing) draft.stops.splice(draft.stops.indexOf(existing), 1);
      draft.stops.splice(index, 0, { ...existing, ...node, stayDays: change.stayDays ?? existing?.stayDays ?? 1 });
    }
  }

  if (intent.departureDate) {
    if (!intent.referenceDate && current.departureDate && current.referenceDate) {
      const read = (value) => Date.parse(`${value}T00:00:00Z`);
      const date = new Date(read(intent.departureDate) + read(current.referenceDate) - read(current.departureDate));
      draft.referenceDate = date.toISOString().split("T")[0];
    }
    draft.departureDate = intent.departureDate;
  }
  if (intent.referenceDate) draft.referenceDate = intent.referenceDate;
  if (intent.minimumTransferMinutes != null) draft.minimumTransferMinutes = intent.minimumTransferMinutes;
  if (intent.preference != null) draft.preference = intent.preference || null;
  return draft;
}

export function questions(draft, coverageStart, coverageEnd) {
  const needs = [];
  if (draft.unresolved.origin) needs.push(`未能唯一匹配出发地「${draft.unresolved.origin}」，请给出具体城市或站码。`);
  else if (!draft.origin) needs.push("从哪个城市出发？");
  if (draft.unresolved.destination) needs.push(`未能唯一匹配目的地「${draft.unresolved.destination}」，请给出具体城市或站码。`);
  else if (draft.suggestion && !draft.suggestion.applied) needs.push(`想去${draft.suggestion.region}的哪个城市？`);
  else if (!draft.destination) needs.push("想到哪个城市？");
  for (const stop of draft.pendingStops) {
    if (stop.ambiguousPlace) needs.push(`未能唯一匹配「${stop.place}」，请给出具体城市或站码，或说明要跳过。`);
    else if (stop.action === "UNCLEAR") needs.push(`在${stop.place}是仅经过、换乘，还是下车停留？`);
    else if (stop.ambiguousPosition) needs.push(`请说明在行程中哪个节点之前或之后加停${stop.place}。`);
    else needs.push(`当前历史规划无法指定在${stop.place}${stop.action === "PASS" ? "仅经过" : "换乘"}。可以改为下车停留，或跳过这个条件。`);
  }
  if (!draft.departureDate) needs.push("计划哪天出发？");
  if (!draft.referenceDate || draft.referenceDate < coverageStart || draft.referenceDate > coverageEnd) {
    needs.push(`请给出 ${coverageStart} 至 ${coverageEnd} 内的历史参考日。`);
  }
  if (draft.minimumTransferMinutes == null) needs.push("最短换乘间隔设为多少分钟？");
  if (draft.stops.some((node) => !Number.isInteger(node.stayDays ?? 1))) needs.push("请给出有效的停留天数。");
  return needs;
}
