"use client";
import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";

const MESSAGES = [
  { title: "Beautiful", subtitle: "Another step on your journey" },
  { title: "Wonderful", subtitle: "You're building something meaningful" },
  { title: "Lovely", subtitle: "Every day counts" },
  { title: "Perfect", subtitle: "Here's to more good days ahead" },
  { title: "Brilliant", subtitle: "You're doing great" },
  { title: "Amazing", subtitle: "Keep shining" },
];

interface CelebrationProps {
  onComplete: () => void;
  dayType: "Good day" | "Bad day";
}

export default function Celebration({ onComplete, dayType }: CelebrationProps) {
  const [message] = useState(() =>
    MESSAGES[Math.floor(Math.random() * MESSAGES.length)]
  );

  useEffect(() => {
    const timer = setTimeout(onComplete, 2000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  const isGoodDay = dayType === "Good day";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-50 bg-stone-900 flex flex-col items-center justify-center"
      onClick={onComplete}
    >
      {/* Subtle background glow */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 0.15, scale: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className={`absolute w-64 h-64 rounded-full blur-3xl ${
          isGoodDay ? "bg-orange-700" : "bg-stone-500"
        }`}
      />

      {/* Main content */}
      <div className="relative z-10 text-center px-8">
        {/* Checkmark circle */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{
            type: "spring",
            stiffness: 200,
            damping: 20,
            delay: 0.1,
          }}
          className={`mx-auto mb-8 w-20 h-20 rounded-full flex items-center justify-center ${
            isGoodDay
              ? "bg-orange-700/20 ring-1 ring-orange-700/40"
              : "bg-stone-500/20 ring-1 ring-stone-500/40"
          }`}
        >
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.2 }}
          >
            <Check
              className={`w-10 h-10 ${
                isGoodDay ? "text-orange-400" : "text-stone-400"
              }`}
              strokeWidth={2.5}
            />
          </motion.div>
        </motion.div>

        {/* Title */}
        <motion.h1
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.25, duration: 0.4 }}
          className="text-3xl font-semibold text-white mb-2 tracking-tight"
        >
          {message.title}
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.4 }}
          className="text-stone-400 text-base"
        >
          {message.subtitle}
        </motion.p>

        {/* Day type indicator */}
        <motion.div
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.45, duration: 0.4 }}
          className={`mt-6 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium tracking-wide ${
            isGoodDay
              ? "bg-orange-700/10 text-orange-400 ring-1 ring-orange-700/20"
              : "bg-stone-500/10 text-stone-400 ring-1 ring-stone-500/20"
          }`}
        >
          {isGoodDay ? "Good Day" : "Day Logged"}
        </motion.div>
      </div>

      {/* Progress bar */}
      <motion.div
        className="absolute bottom-12 left-1/2 -translate-x-1/2 w-32 h-0.5 bg-stone-800 rounded-full overflow-hidden"
      >
        <motion.div
          initial={{ width: "0%" }}
          animate={{ width: "100%" }}
          transition={{ duration: 2, ease: "linear" }}
          className={`h-full ${isGoodDay ? "bg-orange-700" : "bg-stone-500"}`}
        />
      </motion.div>
    </motion.div>
  );
}
