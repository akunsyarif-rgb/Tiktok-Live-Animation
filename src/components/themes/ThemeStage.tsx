"use client";
import { useSyncExternalStore } from "react";
import type { AtmController } from "../../lib/controller.ts";
import type { ThemeId } from "../../lib/protocol.ts";
import { AtmStage } from "../atm/AtmStage.tsx";

export function ThemeStage({ controller, theme }: { controller: AtmController; theme: ThemeId }) {
  const snap = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  if (theme === "atm") return <AtmStage controller={controller} />;
  const active = snap.phase !== "standby" && snap.current;
  const name = snap.current?.username ?? "";
  if (theme === "reactor") return <div className="theme-stage reactor-theme">
    <header>LIVE INTERACTION SYSTEM <i /></header><div className="reactor-orbit orbit-a" /><div className="reactor-orbit orbit-b" />
    <div className={"reactor-core " + (active ? "reactor-active" : "")}><small>ENERGY CORE</small><b>{active ? "POWER SURGE" : "STANDBY"}</b></div>
    <div className="theme-message"><small>{active ? "EVENT DETECTED" : "WELCOME TO THE SHOW"}</small><strong>{active ? "@" + name : "EVERY VIEWER MATTERS"}</strong><span>{active ? snap.phase.toUpperCase() : "JOIN THE ROOM AND ACTIVATE THE CORE"}</span></div>
    <footer>VIRTUAL ENTERTAINMENT ONLY · NOT LEGAL TENDER</footer></div>;
  return <div className="theme-stage marble-theme"><header><span>KINETIC LAB</span><span>MECHANISM 02</span><i /></header>
    <div className="marble-rail rail-a" /><div className="marble-rail rail-b" /><div className="marble-gear gear-a" /><div className="marble-gear gear-b" /><div className={"marble-ball " + (active ? "marble-running" : "")} />
    <div className="theme-message"><small>{active ? "SEQUENCE ACTIVE" : "PRECISION IN MOTION"}</small><strong>{active ? "@" + name : "AWAITING INPUT"}</strong><span>{active ? snap.phase.toUpperCase() : "A MACHINE THAT NEVER STANDS STILL"}</span></div>
    <footer>VIRTUAL ENTERTAINMENT ONLY · NOT LEGAL TENDER</footer></div>;
}