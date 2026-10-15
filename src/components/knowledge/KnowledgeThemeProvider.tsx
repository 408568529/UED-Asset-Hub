"use client";

import { ConfigProvider, type ThemeConfig } from "antd";
import zhCN from "antd/locale/zh_CN";
import { useSyncExternalStore, type ReactNode } from "react";
import "./knowledge-theme.css";

// Selected Qwen root values; typography and sizes are the approved Hub adaptation.
const theme: ThemeConfig = {
  cssVar: { key: "hub-knowledge-v13" },
  token: {
    fontSize: 14, fontSizeSM: 14,
    colorPrimary: "#2ccc6c", colorPrimaryHover: "#29a651", colorPrimaryActive: "#20803e",
    colorPrimaryBorder: "#56e891a6", colorPrimaryText: "#20803e", colorPrimaryTextHover: "#165931", colorPrimaryTextActive: "#0a2615",
    colorLink: "#0b72d9", colorLinkHover: "#0b72d9", colorLinkActive: "#095eb3",
    colorText: "#141414", colorTextSecondary: "#141414a6", colorTextPlaceholder: "#14141480", colorTextDisabled: "#14141459",
    colorBgContainer: "#fff", colorBgElevated: "#fff", colorBgContainerDisabled: "#1414140a",
    colorBorder: "#14141426", colorBorderSecondary: "#1414141a", colorError: "#d9150b",
    borderRadius: 8, borderRadiusSM: 8, borderRadiusLG: 10,
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
    Input: { activeBorderColor: "#14141480", hoverBorderColor: "#14141480", activeShadow: "0 0 0 2px #14141414" },
    Select: { activeBorderColor: "#14141480", hoverBorderColor: "#14141480", activeOutlineColor: "#14141414", optionSelectedBg: "#1414140a", optionSelectedColor: "#141414", optionSelectedFontWeight: 500, optionHeight: 32, multipleItemHeight: 24 },
    Dropdown: { borderRadiusLG: 10 },
    Tag: { defaultBg: "#1414140a", defaultColor: "#141414a6", fontSizeSM: 12 },
    Segmented: { trackBg: "transparent", itemSelectedBg: "transparent", itemSelectedColor: "#141414", itemColor: "#141414a6", trackPadding: 0 }
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
