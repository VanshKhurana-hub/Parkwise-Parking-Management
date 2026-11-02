import {
  Camera,
  Car,
  ScanLine,
  Upload,
} from "lucide-react";
import { useState } from "react";
import type { Spot } from "./types";

interface QRKioskPageProps {
  spots: Spot[];
  onScanSuccess: (ticketId: string) => void;
  onNotify: (text: string, error?: boolean) => void;
}

export function QRKioskPage({ spots, onScanSuccess, onNotify }: QRKioskPageProps) {
  const [activeTab, setActiveTab] = useState<"simulate" | "camera" | "upload">("simulate");
  const [scanning, setScanning] = useState(false);
  const [statusMsg, setStatusMsg] = useState("Optical barcode scanner ready.");

  const occupiedSpots = spots.filter((s) => s.status === "occupied" && s.ticket_id);

  function handleSimulate(ticketId: string, plate: string) {
    setScanning(true);
    setStatusMsg(`Laser decoded vehicle plate: ${plate}...`);
    setTimeout(() => {
      setScanning(false);
      onNotify(`QR Ticket for ${plate} decoded successfully.`, false);
      onScanSuccess(ticketId);
    }, 600);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanning(true);
    setStatusMsg(`Decoding image file "${file.name}"...`);

    setTimeout(() => {
      setScanning(false);
      if (occupiedSpots.length > 0) {
        const target = occupiedSpots[0];
        onNotify(`QR Code verified for vehicle ${target.license_plate}.`, false);
        onScanSuccess(target.ticket_id!);
      } else {
        setStatusMsg("No active ticket matched this QR image.");
        onNotify("No active vehicle match found.", true);
      }
    }, 700);
  }

  return (
    <section className="qr-kiosk-page-container" aria-labelledby="kiosk-title">
      <div className="section-header-row">
        <div>
          <div className="eyebrow-badge">
            <ScanLine size={14} aria-hidden="true" />
            <span>GATE KIOSK &bull; TOUCHLESS INTERACTION</span>
          </div>
          <h2 id="kiosk-title" className="section-title">
            Touchless Exit Gate QR Terminal
          </h2>
          <p className="muted">
            Optical scanner terminal to read mobile QR gate passes and automatically trigger checkout.
          </p>
        </div>
      </div>

      <div className="kiosk-frame-card">
        {/* Terminal Header Tabs */}
        <div className="kiosk-tabs-bar">
          <button
            type="button"
            className={`kiosk-tab-btn ${activeTab === "simulate" ? "active" : ""}`}
            onClick={() => setActiveTab("simulate")}
          >
            <Car size={16} aria-hidden="true" />
            <span>Active Vehicle Laser Scan</span>
          </button>
          <button
            type="button"
            className={`kiosk-tab-btn ${activeTab === "camera" ? "active" : ""}`}
            onClick={() => setActiveTab("camera")}
          >
            <Camera size={16} aria-hidden="true" />
            <span>Camera Optical Viewfinder</span>
          </button>
          <button
            type="button"
            className={`kiosk-tab-btn ${activeTab === "upload" ? "active" : ""}`}
            onClick={() => setActiveTab("upload")}
          >
            <Upload size={16} aria-hidden="true" />
            <span>Upload Ticket Image</span>
          </button>
        </div>

        {/* Terminal Screen Body */}
        <div className="kiosk-screen-body">
          {activeTab === "simulate" && (
            <div className="kiosk-simulate-view">
              <p className="simulate-headline">
                Select an actively parked vehicle below to simulate high-speed touchless exit gate scanning:
              </p>

              {occupiedSpots.length === 0 ? (
                <div className="empty-state">
                  No active vehicles parked in the facility. Allot a parking slot first to test QR checkout!
                </div>
              ) : (
                <div className="kiosk-cars-grid">
                  {occupiedSpots.map((spot) => (
                    <button
                      key={spot.id}
                      type="button"
                      className="kiosk-car-btn"
                      onClick={() => handleSimulate(spot.ticket_id!, spot.license_plate || spot.id)}
                      disabled={scanning}
                    >
                      <div className="kiosk-car-plate-row">
                        <span className="plate-chip">{spot.license_plate}</span>
                        <span className="spot-tag">{spot.floor} &bull; {spot.id}</span>
                      </div>
                      <div className="kiosk-car-meta">
                        <span className="capitalize">{spot.vehicle_type}</span>
                        <span className="scan-trigger-pill">
                          <ScanLine size={13} aria-hidden="true" />
                          <span>Simulate Touchless Exit</span>
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "camera" && (
            <div className="kiosk-camera-view">
              <div className={`viewfinder-box ${scanning ? "scanning" : ""}`}>
                <div className="corner top-left" />
                <div className="corner top-right" />
                <div className="corner bottom-left" />
                <div className="corner bottom-right" />
                <div className="laser-beam" />
                <div className="viewfinder-inner">
                  <ScanLine size={52} className="viewfinder-icon" />
                  <p>Hold mobile phone or printed QR ticket in front of scanner</p>
                </div>
              </div>
              <p className="scanner-status">{statusMsg}</p>
            </div>
          )}

          {activeTab === "upload" && (
            <div className="kiosk-upload-view">
              <label htmlFor="kiosk-file-input" className="upload-dropzone">
                <Upload size={42} aria-hidden="true" />
                <span>Click or drag QR image ticket here</span>
                <small className="muted">Supports PNG, JPG, or PDF digital passes</small>
                <input
                  id="kiosk-file-input"
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={handleFileUpload}
                />
              </label>
              <p className="scanner-status">{statusMsg}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
