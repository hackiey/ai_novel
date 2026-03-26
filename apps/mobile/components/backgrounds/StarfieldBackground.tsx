import { useEffect, useRef, useMemo } from "react";
import { View, Animated, Dimensions, StyleSheet } from "react-native";

const STAR_COUNT = 80;
const SHOOTING_STAR_COUNT = 2;

interface Star {
  x: number;
  y: number;
  size: number;
  opacity: number;
  twinkleSpeed: number;
}

interface ShootingStar {
  anim: Animated.Value;
  startX: number;
  startY: number;
  length: number;
  angle: number;
  delay: number;
  duration: number;
}

function generateStars(): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2 + 0.5,
      opacity: Math.random() * 0.6 + 0.2,
      twinkleSpeed: Math.random() * 3000 + 2000,
    });
  }
  return stars;
}

export default function StarfieldBackground() {
  const { width, height } = Dimensions.get("window");
  const stars = useMemo(() => generateStars(), []);

  // Twinkle animations
  const twinkleAnims = useRef(
    stars.map(() => new Animated.Value(0))
  ).current;

  // Shooting star animations
  const shootingStars = useRef<ShootingStar[]>(
    Array.from({ length: SHOOTING_STAR_COUNT }, (_, i) => ({
      anim: new Animated.Value(0),
      startX: Math.random() * 60 + 20,
      startY: Math.random() * 30,
      length: Math.random() * 80 + 60,
      angle: Math.random() * 20 + 25,
      delay: Math.random() * 8000 + i * 6000,
      duration: Math.random() * 800 + 600,
    }))
  ).current;

  useEffect(() => {
    // Start twinkle animations
    const twinkleAnimations = stars.map((star, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(twinkleAnims[i], {
            toValue: 1,
            duration: star.twinkleSpeed,
            useNativeDriver: true,
          }),
          Animated.timing(twinkleAnims[i], {
            toValue: 0,
            duration: star.twinkleSpeed,
            useNativeDriver: true,
          }),
        ])
      )
    );
    twinkleAnimations.forEach((a) => a.start());

    // Start shooting star animations
    const shootingAnimations = shootingStars.map((ss) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(ss.delay + Math.random() * 10000),
          Animated.timing(ss.anim, {
            toValue: 1,
            duration: ss.duration,
            useNativeDriver: true,
          }),
          Animated.timing(ss.anim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
          Animated.delay(Math.random() * 12000 + 5000),
        ])
      )
    );
    shootingAnimations.forEach((a) => a.start());

    return () => {
      twinkleAnimations.forEach((a) => a.stop());
      shootingAnimations.forEach((a) => a.stop());
    };
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Stars */}
      {stars.map((star, i) => {
        const animatedOpacity = twinkleAnims[i].interpolate({
          inputRange: [0, 1],
          outputRange: [star.opacity * 0.3, star.opacity],
        });

        return (
          <Animated.View
            key={i}
            style={{
              position: "absolute",
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: star.size,
              height: star.size,
              borderRadius: star.size / 2,
              backgroundColor: "#ffffff",
              opacity: animatedOpacity,
            }}
          />
        );
      })}

      {/* Shooting stars */}
      {shootingStars.map((ss, i) => {
        const translateX = ss.anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, ss.length * Math.cos((ss.angle * Math.PI) / 180)],
        });
        const translateY = ss.anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, ss.length * Math.sin((ss.angle * Math.PI) / 180)],
        });
        const opacity = ss.anim.interpolate({
          inputRange: [0, 0.2, 0.8, 1],
          outputRange: [0, 0.8, 0.6, 0],
        });

        return (
          <Animated.View
            key={`ss-${i}`}
            style={{
              position: "absolute",
              left: `${ss.startX}%`,
              top: `${ss.startY}%`,
              width: 40,
              height: 1.5,
              backgroundColor: "#ffffff",
              borderRadius: 1,
              opacity,
              transform: [
                { translateX },
                { translateY },
                { rotate: `${ss.angle}deg` },
              ],
            }}
          />
        );
      })}
    </View>
  );
}
