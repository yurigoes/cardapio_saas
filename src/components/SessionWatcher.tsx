"use client";

import { useEffect, useRef, useState } from "react";

export default function SessionWatcher({
  active,
  onTimeout,
  primaryColor = "#d9b35f"
}: {
  active: boolean;
  onTimeout: () => void;
  primaryColor?: string;
}) {
  const [idleSeconds, setIdleSeconds] = useState(0);
  const [countdown, setCountdown] = useState(60);
  const [showModal, setShowModal] = useState(false);
  const didTimeoutRef = useRef(false);

  function resetActivity() {
    if (didTimeoutRef.current) return;

    setIdleSeconds(0);
    setCountdown(60);
    setShowModal(false);
  }

  function stillHere() {
    resetActivity();
  }

  useEffect(() => {
    if (!active) {
      didTimeoutRef.current = false;
      setIdleSeconds(0);
      setCountdown(60);
      setShowModal(false);
      return;
    }

    didTimeoutRef.current = false;
    setIdleSeconds(0);
    setCountdown(60);
    setShowModal(false);

    const activityEvents = ["pointerdown", "keydown", "touchstart"];

    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, resetActivity, { passive: true });
    });

    const timer = window.setInterval(() => {
      setIdleSeconds((currentIdle) => {
        const nextIdle = currentIdle + 1;

        if (nextIdle < 5) {
          return nextIdle;
        }

        setCountdown((currentCountdown) => {
          const nextCountdown = currentCountdown - 1;

          if (nextCountdown <= 20) {
            setShowModal(true);
          }

          if (nextCountdown <= 0 && !didTimeoutRef.current) {
            didTimeoutRef.current = true;
            window.clearInterval(timer);
            onTimeout();
            return 60;
          }

          return nextCountdown;
        });

        return nextIdle;
      });
    }, 1000);

    return () => {
      window.clearInterval(timer);

      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, resetActivity);
      });
    };
  }, [active, onTimeout]);

  if (!active || !showModal) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 px-6 backdrop-blur-xl">
      <div
        className="w-full max-w-lg rounded-[2rem] border bg-black/85 p-10 text-center text-white shadow-2xl"
        style={{ borderColor: `${primaryColor}66` }}
      >
        <p
          className="text-xs font-black uppercase tracking-[0.4em]"
          style={{ color: primaryColor }}
        >
          Sessão pausada
        </p>

        <h2 className="mt-4 font-serif text-4xl font-black">
          Você ainda está aí?
        </h2>

        <p className="mt-4 text-zinc-300">
          A sessão será encerrada em{" "}
          <strong style={{ color: primaryColor }}>{countdown}s</strong>.
        </p>

        <button
          type="button"
          onPointerUp={stillHere}
          className="mt-8 rounded-full px-10 py-4 text-lg font-black text-black shadow-xl transition hover:scale-105"
          style={{
            background: `linear-gradient(135deg, ${primaryColor}, #fff0b8)`
          }}
        >
          Estou aqui
        </button>
      </div>
    </div>
  );
}