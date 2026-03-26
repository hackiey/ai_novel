import { useEffect, useRef, useMemo } from "react";
import { View, Animated, Dimensions, StyleSheet } from "react-native";

const DROP_COUNT = 40;
const SPLASH_COUNT = 12;

interface RainDrop {
  x: number;
  length: number;
  speed: number;
  opacity: number;
  width: number;
  delay: number;
}

function generateDrops(): RainDrop[] {
  const drops: RainDrop[] = [];
  for (let i = 0; i < DROP_COUNT; i++) {
    drops.push({
      x: Math.random() * 100,
      length: Math.random() * 20 + 10,
      speed: Math.random() * 800 + 800,
      opacity: Math.random() * 0.3 + 0.1,
      width: Math.random() * 1 + 0.5,
      delay: Math.random() * 2000,
    });
  }
  return drops;
}

function generateSplashes() {
  return Array.from({ length: SPLASH_COUNT }, () => ({
    x: Math.random() * 100,
    y: Math.random() * 40 + 60,
    delay: Math.random() * 4000,
    interval: Math.random() * 3000 + 2000,
  }));
}

export default function RainBackground() {
  const { height } = Dimensions.get("window");
  const drops = useMemo(() => generateDrops(), []);
  const splashes = useMemo(() => generateSplashes(), []);

  const dropAnims = useRef(drops.map(() => new Animated.Value(0))).current;
  const splashAnims = useRef(splashes.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    // Rain drop animations
    const dropAnimations = drops.map((drop, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(drop.delay),
          Animated.timing(dropAnims[i], {
            toValue: 1,
            duration: drop.speed,
            useNativeDriver: true,
          }),
          Animated.timing(dropAnims[i], {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      )
    );
    dropAnimations.forEach((a) => a.start());

    // Splash animations
    const splashAnimations = splashes.map((splash, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(splash.delay),
          Animated.timing(splashAnims[i], {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(splashAnims[i], {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
          Animated.delay(splash.interval),
        ])
      )
    );
    splashAnimations.forEach((a) => a.start());

    return () => {
      dropAnimations.forEach((a) => a.stop());
      splashAnimations.forEach((a) => a.stop());
    };
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Rain drops */}
      {drops.map((drop, i) => {
        const translateY = dropAnims[i].interpolate({
          inputRange: [0, 1],
          outputRange: [-drop.length, height + drop.length],
        });
        const opacity = dropAnims[i].interpolate({
          inputRange: [0, 0.1, 0.9, 1],
          outputRange: [0, drop.opacity, drop.opacity, 0],
        });

        return (
          <Animated.View
            key={i}
            style={{
              position: "absolute",
              left: `${drop.x}%`,
              top: 0,
              width: drop.width,
              height: drop.length,
              backgroundColor: "rgba(180,200,220,0.6)",
              borderRadius: drop.width / 2,
              opacity,
              transform: [{ translateY }],
            }}
          />
        );
      })}

      {/* Splash effects */}
      {splashes.map((splash, i) => {
        const scale = splashAnims[i].interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: [0, 1, 1.5],
        });
        const opacity = splashAnims[i].interpolate({
          inputRange: [0, 0.3, 1],
          outputRange: [0, 0.4, 0],
        });

        return (
          <Animated.View
            key={`sp-${i}`}
            style={{
              position: "absolute",
              left: `${splash.x}%`,
              top: `${splash.y}%`,
              width: 6,
              height: 2,
              borderRadius: 3,
              backgroundColor: "rgba(180,200,220,0.5)",
              opacity,
              transform: [{ scaleX: scale }, { scaleY: scale }],
            }}
          />
        );
      })}
    </View>
  );
}
