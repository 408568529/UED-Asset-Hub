"use client";

import { ConfigProvider, type ThemeConfig } from "antd";
import zhCN from "antd/locale/zh_CN";
import { useSyncExternalStore, type ReactNode } from "react";
import "./knowledge-theme.css";

const theme: ThemeConfig = {
  cssVar: { key: "hub-knowledge-v11" },
  token: {
    colorPrimary: "#B7F519",
    colorPrimaryHover: "#C5F64D",
    colorPrimaryActive: "#A4DC16",
    colorPrimaryBorder: "#739833",
    colorPrimaryText: "#496B08",
    colorPrimaryTextHover: "#385206",
    colorPrimaryTextActive: "#2C4105",
    colorLink: "#496B08",
    colorLinkHover: "#385206",
    colorLinkActive: "#2C4105",
    colorText: "#1C241A",
    colorTextSecondary: "#626B5E",
    colorTextPlaceholder: "#767E72",
    colorTextDisabled: "#A1A79D",
    colorBgContainer: "#FFFFFF",
    colorBgElevated: "#FFFFFF",
    colorBgContainerDisabled: "#F2F4EF",
    colorBorder: "#ABB5A5",
    colorBorderSecondary: "#E4E8E1",
    borderRadius: 4,
    borderRadiusSM: 4,
    borderRadiusLG: 8,
    controlHeight: 32,
    controlHeightSM: 32,
    controlHeightLG: 36,
    fontSize: 14,
    fontSizeSM: 14,
    fontFamily: 'Inter, "SF Pro Display", "SF Pro Text", "PingFang SC", "Microsoft YaHei", Arial, sans-serif',
    controlOutline: "rgba(73, 107, 8, 0.18)",
    boxShadowSecondary: "0 6px 20px rgba(28, 36, 26, 0.12)"
  },
  components: {
    Button: {
      primaryColor: "#1C241A", fontWeight: 500, primaryShadow: "none", defaultShadow: "none",
      defaultHoverColor: "#496B08", defaultHoverBorderColor: "#739833",
      defaultActiveColor: "#385206", defaultActiveBorderColor: "#59742D"
    },
    Input: { activeBorderColor: "#739833", hoverBorderColor: "#7C8C72", activeShadow: "0 0 0 2px rgba(73, 107, 8, 0.14)" },
    Select: {
      activeBorderColor: "#739833", hoverBorderColor: "#7C8C72",
      optionSelectedBg: "#EDF6D9", optionSelectedColor: "#1C241A", optionSelectedFontWeight: 500,
      optionHeight: 32, multipleItemHeight: 24
    },
    Tag: { defaultBg: "#F2F4EF", defaultColor: "#52604A", fontSizeSM: 12 },
    Segmented: { trackBg: "#EFF2EB", itemSelectedBg: "#FFFFFF", itemSelectedColor: "#1C241A", itemColor: "#626B5E" },
    Dropdown: { borderRadiusLG: 8 }
  }
};

// Disable Ant motion as well as CSS motion, so reduced-motion popups align before interaction.
const reducedMotionTheme: ThemeConfig = { ...theme, token: { ...theme.token, motion: false } };
const reducedMotionQuery = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(listener: () => void) {
  const query = window.matchMedia(reducedMotionQuery);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

export function KnowledgeThemeProvider({ children }: { children: ReactNode }) {
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, () => window.matchMedia(reducedMotionQuery).matches, () => false);
  return <ConfigProvider locale={zhCN} button={{ autoInsertSpace: false }} theme={reducedMotion ? reducedMotionTheme : theme}>{children}</ConfigProvider>;
}
