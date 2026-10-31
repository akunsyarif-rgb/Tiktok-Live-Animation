"use client";
import { useSyncExternalStore } from "react";
import type { AtmController } from "../../lib/controller.ts";
import type { ThemeId } from "../../lib/protocol.ts";
import { AtmStage } from "../atm/AtmStage.tsx";

export function ThemeStage({ controller, theme }: { controller: AtmController; theme: ThemeId }) {
  const snap = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  if (theme === "atm") return <AtmStage controller={controller} />;
  const event = snap.current;
  const active = snap.phase !== "standby" && !!event;
  const joining = event?.type === "VIEWER_JOIN";
  const level = !event || joining ? 0 : event.type === "GIFT_SMALL" ? 1 : 3;
  const phase = snap.phase.toUpperCase();
  const username = event?.username ? "@" + event.username : "";
  const giftName = event?.gift?.name ?? "GIFT";
  const amount = event?.gift ? `×${event.gift.count}` : "";
  const message = active ? (joining ? "WELCOME, VIEWER" : "GIFT POWER RECEIVED") : "EVERY VIEWER MATTERS";

  if (theme === "reactor") return (
    <div className={`theme-stage reactor-theme ${active ? "event-active" : "idle"} level-${level} phase-${snap.phase}`} key={snap.runKey}>
      <div className="scene-grain" />
      <header><span>LIVE INTERACTION SYSTEM</span><span className="status-chip"><i /> REACTOR ONLINE</span></header>
      <div className="reactor-stage">
        <div className="reactor-backlight" />
        <div className="reactor-orbit orbit-a"><i /><i /><i /></div>
        <div className="reactor-orbit orbit-b"><i /><i /></div>
        <div className="reactor-orbit orbit-c" />
        <div className="reactor-spokes" />
        <div className="reactor-core-wrap"><div className="reactor-core"><div className="core-inner"><small>ENERGY CORE</small><b>{active ? joining ? "SYNC" : "CHARGING" : "STANDBY"}</b><span>{active ? "•••" : "READY"}</span></div></div></div>
        <div className="reactor-floor" />
        <div className="reactor-readout"><span>OUTPUT</span><b>{active ? level === 0 ? "12%" : level === 1 ? "48%" : "96%" : "08%"}</b><span>POWER</span></div>
      </div>
      <div className="theme-message">
        <div className="message-kicker"><i /> {active ? message : "THE REACTOR IS WAITING"}</div>
        <strong>{active ? username : "IGNITE THE CORE"}</strong>
        <span>{active ? joining ? "NEW VIEWER DETECTED" : `${giftName.toUpperCase()} ${amount}` : "JOIN THE LIVE · CHANGE THE ENERGY"}</span>
        {active && <div className="event-progress"><i /></div>}
      </div>
      <footer><span>REACTOR // 01</span><span>VIRTUAL EFFECT · NOT LEGAL TENDER</span></footer>
    </div>
  );

  return (
    <div className={`theme-stage marble-theme ${active ? "event-active" : "idle"} level-${level} phase-${snap.phase}`} key={snap.runKey}>
      <div className="scene-grain" />
      <header><span>KINETIC LAB</span><span className="status-chip"><i /> MECHANISM 02</span></header>
      <div className="marble-stage">
        <div className="marble-backlight" />
        <div className="marble-rail rail-a"><i /></div>
        <div className="marble-rail rail-b"><i /></div>
        <div className="marble-rail rail-c" />
        <div className="marble-gear gear-a"><i /></div><div className="marble-gear gear-b"><i /></div>
        <div className="marble-piston piston-a" /><div className="marble-piston piston-b" />
        <div className="marble-ball"><i /></div>
        <div className="marble-target"><i /></div>
        <div className="marble-readout"><small>RUN STATUS</small><b>{active ? "IN MOTION" : "READY"}</b></div>
      </div>
      <div className="theme-message">
        <div className="message-kicker"><i /> {active ? joining ? "NEW ARRIVAL" : "GIFT ACTIVATED" : "PRECISION IN MOTION"}</div>
        <strong>{active ? username : "START THE MACHINE"}</strong>
        <span>{active ? joining ? "WELCOME TO THE LIVE" : `${giftName.toUpperCase()} ${amount}` : "EVERY ACTION SETS IT IN MOTION"}</span>
        {active && <div className="event-progress"><i /></div>}
      </div>
      <footer><span>KINETIC // 02</span><span>VIRTUAL EFFECT · NOT LEGAL TENDER</span></footer>
    </div>
  );
}
