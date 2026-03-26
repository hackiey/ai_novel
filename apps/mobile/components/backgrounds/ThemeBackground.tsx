import { View, StyleSheet } from "react-native";
import type { ThemeVariant } from "../../lib/theme";
import StarfieldBackground from "./StarfieldBackground";
import RainBackground from "./RainBackground";

interface Props {
  theme: ThemeVariant;
  bgColor: string;
}

export default function ThemeBackground({ theme, bgColor }: Props) {
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: bgColor }]} pointerEvents="none">
      {theme === "starfield" && <StarfieldBackground />}
      {theme === "rain" && <RainBackground />}
    </View>
  );
}
