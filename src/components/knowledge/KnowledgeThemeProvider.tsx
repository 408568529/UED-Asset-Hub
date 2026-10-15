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

// Selected Qwen root values; typography and sizes are the approved Hub adaptation.
const detailTheme: ThemeConfig = {
  cssVar: { key: "hub-knowledge-v13" },
  token: {
    ...theme.token,
    colorPrimary: "#2ccc6c", colorPrimaryHover: "#29a651", colorPrimaryActive: "#20803e",
    colorPrimaryBorder: "#56e891a6", colorPrimaryText: "#20803e", colorPrimaryTextHover: "#165931", colorPrimaryTextActive: "#0a2615",
    colorLink: "#0b72d9", colorLinkHover: "#0b72d9", colorLinkActive: "#095eb3",
    colorText: "#141414", colorTextSecondary: "#141414a6", colorTextPlaceholder: "#14141480", colorTextDisabled: "#14141459",
    colorBgContainer: "#fff", colorBgElevated: "#fff", colorBgContainerDisabled: "#1414140a",
    colorBorder: "#14141426", colorBorderSecondary: "#1414141a", colorError: "#d9150b",
    borderRadius: 8, borderRadiusSM: 6, borderRadiusLG: 10,
    controlHeight: 36, controlHeightSM: 32, controlHeightLG: 40,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif',
    lineWidthFocus: 2, controlOutline: "#14141426", boxShadowSecondary: "0 5px 20px -5px #0000001a, 0 4px 20px -4px #00000012"
  },
  components: {
    Button: {
      colorPrimary: "#141414", colorPrimaryBorder: "#141414", colorPrimaryHover: "#2d2d2d", colorPrimaryActive: "#141414", primaryColor: "#fff",
      fontWeight: 500, primaryShadow: "none", defaultShadow: "none", defaultColor: "#141414", defaultBorderColor: "#14141426",
      defaultHoverColor: "#141414", defaultHoverBorderColor: "#14141480", defaultHoverBg: "#1414140a",
      defaultActiveColor: "#141414", defaultActiveBorderColor: "#14141480"
    },
    Tag: { defaultBg: "#1414140a", defaultColor: "#141414a6", fontSizeSM: 12 },
    Segmented: { trackBg: "transparent", itemSelectedBg: "transparent", itemSelectedColor: "#141414", itemColor: "#141414a6", trackPadding: 0 }
  }
};

// Disable Ant motion as well as CSS motion, so reduced-motion popups align before interaction.
const reducedMotionTheme: ThemeConfig = { ...theme, token: { ...theme.token, motion: false } };
const reducedMotionDetailTheme: ThemeConfig = { ...detailTheme, token: { ...detailTheme.token, motion: false } };
const reducedMotionQuery = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(listener: () => void) {
  const query = window.matchMedia(reducedMotionQuery);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

export function KnowledgeThemeProvider({ children, detail = false }: { children: ReactNode; detail?: boolean }) {
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, () => window.matchMedia(reducedMotionQuery).matches, () => false);
  return <ConfigProvider locale={zhCN} button={{ autoInsertSpace: false }} theme={detail ? (reducedMotion ? reducedMotionDetailTheme : detailTheme) : (reducedMotion ? reducedMotionTheme : theme)}>{children}</ConfigProvider>;
}
