import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { FrameApp } from "@/frame/FrameApp";

const AdminApp = React.lazy(() => import("@/admin/AdminApp"));

function Root() {
  if (window.location.pathname.startsWith("/admin")) {
    return (
      <React.Suspense fallback={null}>
        <AdminApp />
      </React.Suspense>
    );
  }

  return <FrameApp />;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
