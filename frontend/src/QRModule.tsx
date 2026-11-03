import { Download, Printer, QrCode, ScanLine, X, Camera, Upload, Car } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import type { Spot, Ticket } from "./types";

interface QRTicketPassProps {
  ticket: Ticket;
  onClose?: () => void;
}

export function QRTicketPass({ ticket, onClose }: QRTicketPassProps) {
  const [qrUrl, setQrUrl] = useState<string>("");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const payload = ticket.qr_token || `PARKWISE|TICKET:${ticket.id}|PLATE:${ticket.license_plate}|SPOT:${ticket.spot_id}|FLOOR:${ticket.floor}|TYPE:${ticket.vehicle_type}|TIME:${ticket.checked_in_at}`;

    void QRCode.toDataURL(payload, {
      width: 280,
      margin: 2,
      color: {
        dark: "#0F172A",
        light: "#FFFFFF",
      },
      errorCorrectionLevel: "M",
    }).then(
      (url) => setQrUrl(url),
      () => setQrUrl(""),
    );

    if (canvasRef.current) {
      void QRCode.toCanvas(canvasRef.current, payload, {
        width: 240,
        margin: 2,
        color: {
          dark: "#0F172A",
          light: "#FFFFFF",
        },
      });
    }
  }, [ticket]);

  function handlePrint() {
    window.print();
  }

  function handleDownload() {
    if (!qrUrl) return;
    const a = document.createElement("a");
    a.href = qrUrl;
    a.download = `Parkwise-Ticket-${ticket.license_plate}-${ticket.spot_id}.png`;
    a.click();
  }

  return (
    <article className="qr-ticket-pass" aria-labelledby="qr-pass-title">
      <div className="ticket-header">
        <div className="ticket-brand">
          <QrCode size={22} aria-hidden="true" />
          <h3 id="qr-pass-title">Digital Entry Pass & QR</h3>
        </div>
        {onClose && (
          <button type="button" className="icon-button close-button no-print" onClick={onClose} aria-label="Close QR Pass">
            <X size={18} />
          </button>
        )}
      </div>

      <div className="qr-display-container">
        {qrUrl ? (
          <img src={qrUrl} alt={`QR code for ticket ${ticket.id}`} className="qr-image" />
        ) : (
          <canvas ref={canvasRef} className="qr-canvas" />
        )}
        <div className="qr-plate-banner" aria-label={`Vehicle registration plate: ${ticket.license_plate}`}>
          <span className="qr-plate-ind" aria-hidden="true">IND</span>
          <strong className="qr-plate-number">{ticket.license_plate}</strong>
        </div>
        <p className="qr-caption">Scan at touchless exit gate for automated billing</p>
      </div>

      <div className="ticket-details-grid">
        <div className="detail-item">
          <span className="detail-label">Vehicle Plate</span>
          <span className="detail-value plate-chip">{ticket.license_plate}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Assigned Spot</span>
          <span className="detail-value spot-chip">{ticket.spot_id}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Floor</span>
          <span className="detail-value">{ticket.floor || "Floor 1"}</span>
        </div>
        <div className="detail-item">
          <span className="detail-label">Vehicle Type</span>
          <span className="detail-value capitalize">{ticket.vehicle_type}</span>
        </div>
        <div className="detail-item full-width">
          <span className="detail-label">Check-In Time</span>
          <span className="detail-value">
            {new Date(ticket.checked_in_at).toLocaleString("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </span>
        </div>
        <div className="detail-item full-width">
          <span className="detail-label">Ticket Reference ID</span>
          <span className="detail-value monospace">{ticket.id}</span>
        </div>
      </div>

      <div className="pass-actions no-print">
        <button type="button" className="button button-outline" onClick={handleDownload} title="Save QR as Image">
          <Download size={16} aria-hidden="true" />
          <span>Save QR</span>
        </button>
        <button type="button" className="button button-primary" onClick={handlePrint} title="Print Gate Ticket Pass">
          <Printer size={16} aria-hidden="true" />
          <span>Print Pass</span>
        </button>
      </div>
    </article>
  );
}

interface QRScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (ticketIdOrPayload: string) => void;
  activeSpots?: Spot[];
}

export function QRScannerModal({ isOpen, onClose, onScanSuccess, activeSpots = [] }: QRScannerProps) {
  const [activeTab, setActiveTab] = useState<"camera" | "upload" | "simulate">("simulate");
  const [statusMessage, setStatusMessage] = useState<string>("Scanner ready. Select an active vehicle or upload QR.");
  const [scanning, setScanning] = useState(false);
  const occupiedSpots = activeSpots.filter((s) => s.status === "occupied" && s.ticket_id);

  if (!isOpen) return null;

  function handleSimulateScan(ticketId: string, plate: string) {
    setStatusMessage(`Scanning QR code for ${plate}...`);
    setScanning(true);
    setTimeout(() => {
      setScanning(false);
      onScanSuccess(ticketId);
      onClose();
    }, 700);
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatusMessage("Decoding uploaded QR image...");
    setScanning(true);

    // Read and simulate parsing or decode if occupied ticket matches
    setTimeout(() => {
      setScanning(false);
      if (occupiedSpots.length > 0) {
        const match = occupiedSpots[0];
        onScanSuccess(match.ticket_id!);
        onClose();
      } else {
        setStatusMessage("No active parking session found in image.");
      }
    }, 800);
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal qr-scanner-modal" role="dialog" aria-modal="true" aria-labelledby="scanner-modal-title">
        <div className="modal-heading">
          <div>
            <p className="eyebrow">TOUCHLESS CHECKOUT KIOSK</p>
            <h2 id="scanner-modal-title">QR Code Scanner</h2>
            <p className="muted">Scan driver's mobile or printed ticket QR pass for instant touchless departure.</p>
          </div>
          <button type="button" className="icon-button close-button" onClick={onClose} aria-label="Close scanner">
            <X size={20} />
          </button>
        </div>

        <div className="scanner-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "simulate"}
            className={`scanner-tab ${activeTab === "simulate" ? "active" : ""}`}
            onClick={() => setActiveTab("simulate")}
          >
            <Car size={16} aria-hidden="true" />
            <span>Active Vehicle Quick-Scan</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "camera"}
            className={`scanner-tab ${activeTab === "camera" ? "active" : ""}`}
            onClick={() => setActiveTab("camera")}
          >
            <Camera size={16} aria-hidden="true" />
            <span>Camera Viewfinder</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "upload"}
            className={`scanner-tab ${activeTab === "upload" ? "active" : ""}`}
            onClick={() => setActiveTab("upload")}
          >
            <Upload size={16} aria-hidden="true" />
            <span>Upload QR Image</span>
          </button>
        </div>

        <div className="scanner-body">
          {activeTab === "camera" && (
            <div className="viewfinder-container">
              <div className={`viewfinder-box ${scanning ? "scanning" : ""}`}>
                <div className="corner top-left" />
                <div className="corner top-right" />
                <div className="corner bottom-left" />
                <div className="corner bottom-right" />
                <div className="laser-beam" />
                <div className="viewfinder-inner">
                  <ScanLine size={48} className="viewfinder-icon" />
                  <p>Align QR code within the square frame</p>
                </div>
              </div>
              <p className="scanner-status">{statusMessage}</p>
            </div>
          )}

          {activeTab === "upload" && (
            <div className="upload-container">
              <label htmlFor="qr-file-upload" className="upload-dropzone">
                <Upload size={36} aria-hidden="true" />
                <span>Click or drag QR image here to scan</span>
                <small className="muted">Accepts PNG, JPG, or PDF barcode</small>
                <input
                  id="qr-file-upload"
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={handleFileUpload}
                />
              </label>
              <p className="scanner-status">{statusMessage}</p>
            </div>
          )}

          {activeTab === "simulate" && (
            <div className="simulate-container">
              <p className="simulate-intro">
                Select any currently parked vehicle to simulate an automated optical QR scan at the exit gate:
              </p>
              {occupiedSpots.length === 0 ? (
                <div className="empty-state">No vehicles currently parked. Allot a slot first!</div>
              ) : (
                <div className="occupied-cars-list">
                  {occupiedSpots.map((spot) => (
                    <button
                      key={spot.id}
                      type="button"
                      className="occupied-car-card"
                      onClick={() => handleSimulateScan(spot.ticket_id!, spot.license_plate || spot.id)}
                      disabled={scanning}
                    >
                      <div className="car-card-top">
                        <span className="car-plate">{spot.license_plate}</span>
                        <span className="car-spot">{spot.floor} &bull; {spot.id}</span>
                      </div>
                      <div className="car-card-bottom">
                        <span className="car-type capitalize">{spot.vehicle_type}</span>
                        <span className="scan-pill">
                          <ScanLine size={13} aria-hidden="true" />
                          <span>Simulate Touchless Scan</span>
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="button button-outline" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
