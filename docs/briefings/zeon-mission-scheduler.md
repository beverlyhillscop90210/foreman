# Briefing: Mission Scheduler Service

## Übersicht

Der Scheduler orchestriert kontinuierliche Drohnenmissionen innerhalb definierter Zeitfenster. Ein **Job** repräsentiert eine vollständige Abdeckung der definierten Fläche – unabhängig davon, wie viele Tage oder Flugfenster dafür benötigt werden.

**Kernprinzip:** Die Drohne setzt immer dort fort, wo sie aufgehört hat. Erst wenn die gesamte Fläche abgedeckt ist, beginnt ein neuer Job von vorne.

## Kernkonzept

```
┌─────────────────────────────────────────────────────────────────────┐
│                           JOB-001                                   │
│                     (1200 ha Zielfläche)                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Tag 1 (06:00-10:00)         Tag 2 (06:00-08:30)                   │
│                                                                     │
│  ┌─────────────────────┐     ┌─────────────────────┐               │
│  │█████████████░░░░░░░░│     │█████████████████████│               │
│  │█████████████░░░░░░░░│     │█████████████████████│               │
│  │█████████████░░░░░░░░│     │█████████████████████│               │
│  │█████████████░░░░░░░░│     │█████████████████████│               │
│  │█████████████▲░░░░░░░│     │█████████████████████│               │
│  │█████████████│░░░░░░░│     │█████████████████████│               │
│  └─────────────┼───────┘     └─────────────────────┘               │
│                │                                                    │
│         GPS gespeichert              ✓ JOB COMPLETE                │
│         Fortschritt: 800 ha          → JOB-002 startet von vorne   │
│                                                                     │
│  █ = Abgeflogen    ░ = Noch offen    ▲ = Letzte Position           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Datenmodell

### Schedule Configuration

```typescript
interface ScheduleConfig {
  id: string;                    // "schedule-farm-001"
  farmId: string;                // Referenz zur Farm
  flightAreaHectares: number;    // 1200
  flightAreaPolygon: GeoJSON;    // Exakte Grenzen der Zielfläche
  
  // Zeitfenster (täglich wiederkehrend)
  startTime: string;             // "06:00" (lokale Zeit)
  endTime: string;               // "10:00" (lokale Zeit)
  timezone: string;              // "America/Cuiaba"
  
  // Start-Konfiguration
  startDate: string;             // "2026-03-01" (erster Flugtag)
  endDate?: string;              // Optional: Ende der Saison
  
  // Pause-Tage (z.B. Wartung, Wetter)
  excludeDays?: string[];        // ["2026-03-15", "2026-03-16"]
  
  enabled: boolean;
}
```

### Job (R2 Storage Struktur)

```typescript
interface Job {
  jobId: string;                 // "JOB-001", "JOB-002", ...
  scheduleId: string;            // Referenz zum Schedule
  farmId: string;
  
  status: "in_progress" | "completed" | "paused" | "cancelled";
  
  // Flächen-Tracking
  targetAreaPolygon: GeoJSON;    // Gesamte Zielfläche (1200 ha)
  coveredAreaPolygon: GeoJSON;   // Bereits abgeflogen (akkumuliert)
  remainingAreaPolygon: GeoJSON; // Noch offen (berechnet)
  
  // Fortschritt
  targetHectares: number;        // 1200
  completedHectares: number;     // Akkumuliert über alle Flights
  coveragePercent: number;       // 0-100
  
  // Fortsetzungs-Position
  lastPosition: {
    latitude: number;            // -15.4532
    longitude: number;           // -55.7891
    heading: number;             // Flugrichtung in Grad
    flightLineIndex: number;     // Welche Linie war aktiv
  } | null;
  
  // Zeitstempel
  createdAt: string;             // Wann Job angelegt wurde
  completedAt?: string;          // Wann 100% erreicht
  
  // Flights die zu diesem Job gehören
  flights: FlightRecord[];
}

interface FlightRecord {
  flightId: string;
  date: string;
  startTime: string;
  endTime: string;
  
  // Start/End Position dieses Flights
  startPosition: { lat: number; lng: number };
  endPosition: { lat: number; lng: number };
  
  // Coverage dieses Flights
  flightPathPolygon: GeoJSON;    // Abgedeckte Fläche in diesem Flight
  hectaresCovered: number;
  
  batterySwaps: number;
  
  // Warum beendet?
  endReason: "time_window_end" | "battery_critical" | "area_complete" | "manual_stop" | "weather";
}
```

### R2 Storage Layout

```
/farms/{farmId}/
  └── jobs/
      ├── JOB-001/
      │   ├── manifest.json           # Job Metadaten + Status
      │   ├── target-area.geojson     # Zielfläche
      │   ├── covered-area.geojson    # Bereits abgeflogen (Union aller Flights)
      │   ├── remaining-area.geojson  # Noch offen (target - covered)
      │   └── flights/
      │       ├── flight-001.json
      │       ├── flight-001-path.geojson
      │       ├── flight-002.json
      │       ├── flight-002-path.geojson
      │       └── ...
      ├── JOB-002/
      │   └── ...
      └── active-job.json             # Pointer zum aktiven Job
```

## Route Calculation Service

### Kernlogik: Fortsetzung berechnen

```typescript
class RouteCalculator {
  
  /**
   * Berechnet die Route für den nächsten Flight.
   * Setzt dort fort, wo der letzte Flight aufgehört hat.
   */
  async calculateNextRoute(job: Job): Promise<FlightRoute> {
    
    // 1. Verbleibende Fläche berechnen
    const remainingArea = this.subtractPolygons(
      job.targetAreaPolygon,
      job.coveredAreaPolygon
    );
    
    if (this.getAreaHectares(remainingArea) <= 0) {
      // Job ist fertig
      return { complete: true };
    }
    
    // 2. Fluglinien für verbleibende Fläche generieren
    const flightLines = this.generateFlightLines(remainingArea, {
      lineSpacing: 50,  // Meter zwischen Linien (abhängig von Kamera/Sensor)
      direction: this.calculateOptimalDirection(remainingArea)
    });
    
    // 3. Startpunkt bestimmen
    let startPoint: Coordinate;
    let startLineIndex: number;
    
    if (job.lastPosition) {
      // Fortsetzen: Nächste Linie nach letzter Position
      startPoint = this.findNearestPointOnLines(
        job.lastPosition,
        flightLines
      );
      startLineIndex = job.lastPosition.flightLineIndex;
    } else {
      // Neuer Job: Am Anfang der ersten Linie starten
      startPoint = flightLines[0].start;
      startLineIndex = 0;
    }
    
    // 4. Route vom Dock zum Startpunkt + Fluglinien
    const route: FlightRoute = {
      takeoffPoint: this.getDockPosition(job.farmId),
      transitToStart: this.calculateTransitPath(
        this.getDockPosition(job.farmId),
        startPoint
      ),
      flightLines: flightLines.slice(startLineIndex),
      returnPath: null,  // Wird dynamisch berechnet bei RTH
      estimatedDuration: this.estimateDuration(flightLines),
      estimatedCoverage: this.estimateCoverage(flightLines)
    };
    
    return route;
  }
  
  /**
   * Subtrahiert abgeflogene Fläche von Zielfläche.
   * Verwendet Turf.js oder ähnliche GeoJSON Library.
   */
  subtractPolygons(target: GeoJSON, covered: GeoJSON): GeoJSON {
    // turf.difference(target, covered)
    return difference(target, covered);
  }
  
  /**
   * Generiert parallele Fluglinien über ein Polygon.
   */
  generateFlightLines(area: GeoJSON, options: LineOptions): FlightLine[] {
    // 1. Bounding Box der Fläche
    const bbox = this.getBoundingBox(area);
    
    // 2. Parallele Linien mit gewünschtem Abstand
    const lines: FlightLine[] = [];
    let currentY = bbox.minY;
    let lineIndex = 0;
    let direction = 1; // Alternierend: 1 = links→rechts, -1 = rechts→links
    
    while (currentY <= bbox.maxY) {
      const line = this.createLine(
        { x: direction === 1 ? bbox.minX : bbox.maxX, y: currentY },
        { x: direction === 1 ? bbox.maxX : bbox.minX, y: currentY }
      );
      
      // Nur Teile innerhalb der Fläche behalten
      const clipped = this.clipLineToPolygon(line, area);
      if (clipped) {
        lines.push({
          index: lineIndex++,
          start: clipped.start,
          end: clipped.end,
          lengthMeters: this.calculateDistance(clipped.start, clipped.end)
        });
      }
      
      currentY += options.lineSpacing;
      direction *= -1; // Richtung wechseln (Rasenmäher-Pattern)
    }
    
    return lines;
  }
}
```

### Während des Flugs: Position tracken

```typescript
class FlightTracker {
  
  /**
   * Wird regelmäßig während des Flugs aufgerufen (z.B. alle 5 Sekunden).
   * Updated die abgedeckte Fläche in Echtzeit.
   */
  async updateProgress(job: Job, droneStatus: DroneStatus) {
    
    // 1. Aktuelle Position zur Flugbahn hinzufügen
    this.currentFlightPath.push({
      lat: droneStatus.latitude,
      lng: droneStatus.longitude,
      timestamp: Date.now()
    });
    
    // 2. Abgedeckte Fläche aus Flugbahn berechnen
    // (Buffer um Pfad basierend auf Kamera-Footprint)
    const flightCoveragePolygon = this.pathToPolygon(
      this.currentFlightPath,
      this.cameraFootprintWidth  // z.B. 80m bei 120m Flughöhe
    );
    
    // 3. Zur Gesamt-Coverage hinzufügen
    job.coveredAreaPolygon = union(
      job.coveredAreaPolygon,
      flightCoveragePolygon
    );
    
    // 4. Verbleibende Fläche neu berechnen
    job.remainingAreaPolygon = difference(
      job.targetAreaPolygon,
      job.coveredAreaPolygon
    );
    
    // 5. Hektar und Prozent updaten
    job.completedHectares = this.getAreaHectares(job.coveredAreaPolygon);
    job.coveragePercent = (job.completedHectares / job.targetHectares) * 100;
    
    // 6. Letzte Position speichern (für Resume)
    job.lastPosition = {
      latitude: droneStatus.latitude,
      longitude: droneStatus.longitude,
      heading: droneStatus.heading,
      flightLineIndex: this.currentLineIndex
    };
    
    // 7. Periodisch zu R2 speichern (alle 30 Sekunden)
    if (this.shouldPersist()) {
      await this.saveJobToR2(job);
    }
  }
  
  /**
   * Wird aufgerufen wenn Flight endet (Zeit vorbei, Batterie, etc.)
   */
  async endFlight(job: Job, reason: EndReason) {
    
    // 1. Flight Record erstellen
    const flightRecord: FlightRecord = {
      flightId: generateId(),
      date: new Date().toISOString().split('T')[0],
      startTime: this.flightStartTime,
      endTime: new Date().toISOString(),
      startPosition: this.currentFlightPath[0],
      endPosition: this.currentFlightPath[this.currentFlightPath.length - 1],
      flightPathPolygon: this.pathToPolygon(this.currentFlightPath),
      hectaresCovered: this.flightHectares,
      batterySwaps: this.batterySwapCount,
      endReason: reason
    };
    
    // 2. Zu Job hinzufügen
    job.flights.push(flightRecord);
    
    // 3. Finales Save
    await this.saveJobToR2(job);
    await this.saveFlightToR2(job.jobId, flightRecord);
    
    // 4. Prüfen ob Job komplett
    if (job.coveragePercent >= 99.5) {  // 99.5% Toleranz für GPS-Ungenauigkeiten
      await this.completeJob(job);
    }
  }
}
```

## Scheduler State Machine

```
┌─────────────────────────────────────────────────────────────────┐
│                    SCHEDULER STATE MACHINE                       │
└─────────────────────────────────────────────────────────────────┘

                         ┌──────────────┐
                         │   WAITING    │
                         │ (außerhalb   │
                         │  Zeitfenster)│
                         └──────┬───────┘
                                │
                    [startTime erreicht]
                                │
                                ▼
                    ┌───────────────────────┐
                    │   CALCULATE ROUTE     │
                    │                       │
                    │ • Load active Job     │
                    │ • Get lastPosition    │
                    │ • Compute remaining   │
                    │ • Generate flight     │
                    │   lines from there    │
                    └───────────┬───────────┘
                                │
                                ▼
                         ┌──────────────┐
                         │   FLYING     │◄─────────────────┐
                         │              │                  │
                         │ • Track GPS  │                  │
                         │ • Update     │                  │
                         │   coverage   │                  │
                         └──────┬───────┘                  │
                                │                          │
              ┌─────────────────┼─────────────────┐        │
              │                 │                 │        │
     [endTime erreicht]  [Batterie leer]   [Fläche 100%]  │
              │                 │                 │        │
              ▼                 ▼                 ▼        │
       ┌──────────┐      ┌──────────┐      ┌──────────┐   │
       │ SAVE &   │      │ DOCK &   │      │ COMPLETE │   │
       │ PAUSE    │      │ CHARGE   │      │          │   │
       │          │      │          │      │ • Save   │   │
       │ • Save   │      │ • Save   │      │ • New    │   │
       │   GPS    │      │   GPS    │      │   Job    │   │
       │ • Wait   │      │ • Resume │──────│   starts │   │
       │   till   │      │   after  │      │   from 0 │   │
       │   tomorrow│      │   charge │      └──────────┘   │
       └────┬─────┘      └──────────┘                      │
            │                                              │
            └──────────[nächster Tag, startTime]───────────┘
```

## Pseudo-Code: Hauptschleife

```typescript
class MissionScheduler {
  
  async tick() {
    const now = new Date();
    const schedule = await this.getActiveSchedule();
    
    // Zeitfenster prüfen
    if (!this.isWithinTimeWindow(now, schedule)) {
      if (this.droneIsFlying()) {
        // Zeitfenster endet → Position speichern & zurückkehren
        await this.initiateReturnToDock("time_window_end");
      }
      return; // Warten bis morgen
    }
    
    // Aktiven Job laden oder neuen erstellen
    let job = await this.getActiveJob(schedule.farmId);
    
    if (!job || job.status === "completed") {
      // Neuer Job: Startet von vorne (frische Fläche)
      job = await this.createNewJob(schedule);
    }
    
    // Drohnen-Status prüfen
    const droneStatus = await this.getDroneStatus();
    
    switch (droneStatus.state) {
      
      case "docked_ready":
        // Bereit für nächsten Flight
        if (droneStatus.batteryPercent >= 95) {
          // Route berechnen basierend auf lastPosition
          const route = await this.routeCalculator.calculateNextRoute(job);
          
          if (route.complete) {
            await this.completeJob(job);
          } else {
            await this.startFlight(job, route);
          }
        }
        break;
        
      case "flying":
        // Fortschritt tracken
        await this.flightTracker.updateProgress(job, droneStatus);
        
        // Batterie prüfen
        if (droneStatus.batteryPercent < 25) {
          await this.initiateReturnToDock("battery_low");
        }
        
        // Fläche komplett?
        if (job.coveragePercent >= 99.5) {
          await this.initiateReturnToDock("area_complete");
        }
        break;
        
      case "returning":
        // Warten auf Landung
        break;
        
      case "charging":
        // Warten auf volle Batterie
        break;
    }
  }
  
  async completeJob(job: Job) {
    job.status = "completed";
    job.completedAt = new Date().toISOString();
    job.lastPosition = null;  // Reset für nächsten Job
    
    await this.saveJobToR2(job);
    await this.clearActiveJobPointer(job.farmId);
    
    // Notification
    await this.notify({
      type: "job_complete",
      jobId: job.jobId,
      hectares: job.completedHectares,
      flights: job.flights.length,
      duration: this.calculateJobDuration(job)
    });
  }
  
  async createNewJob(schedule: ScheduleConfig): Promise<Job> {
    const lastJobNumber = await this.getLastJobNumber(schedule.farmId);
    const newJobNumber = lastJobNumber + 1;
    
    const job: Job = {
      jobId: `JOB-${newJobNumber.toString().padStart(3, '0')}`,
      scheduleId: schedule.id,
      farmId: schedule.farmId,
      status: "in_progress",
      
      // Frische Fläche - nichts abgedeckt
      targetAreaPolygon: schedule.flightAreaPolygon,
      coveredAreaPolygon: null,           // Noch nichts
      remainingAreaPolygon: schedule.flightAreaPolygon,  // Alles offen
      
      targetHectares: schedule.flightAreaHectares,
      completedHectares: 0,
      coveragePercent: 0,
      
      lastPosition: null,  // Startet am Anfang
      
      createdAt: new Date().toISOString(),
      flights: []
    };
    
    await this.saveJobToR2(job);
    await this.setActiveJobPointer(schedule.farmId, job.jobId);
    
    return job;
  }
}
```

## Edge Cases

### 1. Zeitfenster endet während Flug
```
Verhalten: 
  1. Drohne beendet aktuelle Linie
  2. GPS Position + Linien-Index gespeichert
  3. RTH (Return to Home)
  4. Nächster Tag: calculateNextRoute() nutzt lastPosition
```

### 2. Batterie während Flug niedrig
```
Verhalten:
  1. Bei 25% → RTH initiieren
  2. Position speichern
  3. Laden
  4. Wenn noch im Zeitfenster → Neuer Flight ab lastPosition
```

### 3. Wetter-Interrupt
```
Verhalten:
  1. Operator stoppt manuell oder automatisch (Wind/Regen Sensor)
  2. Position speichern
  3. Job bleibt "in_progress"
  4. Bei Resume: Fortsetzung ab lastPosition
```

### 4. GPS Drift / Überlappung
```
Verhalten:
  - coveredAreaPolygon ist Union aller Flugbahnen
  - Überlappungen werden automatisch zusammengeführt
  - completedHectares = area(coveredAreaPolygon)
  - Keine Doppelzählung
```

### 5. Fläche exakt erfüllt am Zeitfenster-Ende
```
Verhalten:
  1. coveragePercent >= 99.5% erkannt
  2. Job → "completed"
  3. Nächster Tag: createNewJob() → frische Fläche, lastPosition = null
```

## API Endpoints

```typescript
// Schedule Management
POST   /api/v1/farms/:farmId/schedules          
GET    /api/v1/farms/:farmId/schedules          
PATCH  /api/v1/farms/:farmId/schedules/:id      
DELETE /api/v1/farms/:farmId/schedules/:id      

// Job Management
GET    /api/v1/farms/:farmId/jobs               // Alle Jobs (paginiert)
GET    /api/v1/farms/:farmId/jobs/active        // Aktiver Job mit Coverage
GET    /api/v1/farms/:farmId/jobs/:jobId        
GET    /api/v1/farms/:farmId/jobs/:jobId/coverage    // Coverage GeoJSON
GET    /api/v1/farms/:farmId/jobs/:jobId/remaining   // Verbleibende Fläche

// Route Calculation
GET    /api/v1/farms/:farmId/jobs/:jobId/next-route  // Nächste Route berechnen
POST   /api/v1/farms/:farmId/jobs/:jobId/simulate    // Route simulieren

// Manual Controls
POST   /api/v1/farms/:farmId/jobs/:jobId/pause  
POST   /api/v1/farms/:farmId/jobs/:jobId/resume 
POST   /api/v1/farms/:farmId/jobs/:jobId/cancel 
```

## Dashboard Integration

```
┌─────────────────────────────────────────────────────────────────┐
│ Farm: Fazenda Santa Clara                                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                                                         │   │
│  │     ████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░    │   │
│  │     ████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░    │   │
│  │     ████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░    │   │
│  │     ████████████████████▲░░░░░░░░░░░░░░░░░░░░░░░░░░    │   │
│  │     ████████████████████│░░░░░░░░░░░░░░░░░░░░░░░░░░    │   │
│  │                         │                               │   │
│  │     █ Abgeflogen    ░ Offen    ▲ Aktuelle Position     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Aktiver Job: JOB-047                                          │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 67%          │
│  804 / 1200 ha                                                  │
│                                                                 │
│  Letzte Position: -15.4532, -55.7891                           │
│  Nächster Start: Fortsetzung bei Linie 847                     │
│                                                                 │
│  Zeitfenster: 06:00 - 10:00 (America/Cuiaba)                   │
│  Status: 🟡 PAUSED (Zeitfenster beendet)                       │
│                                                                 │
│  Heute:     2 Flights, 534 ha (67% → 78%)                      │
│  Gestern:   3 Flights, 270 ha (0% → 67%)                       │
│                                                                 │
│  [Pause Job]  [View Route]  [Job History]                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Zusammenfassung

| Konzept | Definition |
|---------|------------|
| **Schedule** | Konfiguration: Zeitfenster, Fläche, Start/End Datum |
| **Job** | Eine vollständige Abdeckung der Zielfläche (kann mehrere Tage dauern) |
| **Flight** | Ein einzelner Drohnenflug (Start → Landing) |
| **lastPosition** | GPS + Linien-Index wo fortgesetzt werden soll |
| **coveredArea** | Polygon der bereits abgeflogenen Fläche |
| **remainingArea** | Polygon der noch offenen Fläche (target - covered) |

**Kernprinzip:** 
1. Drohne fliegt täglich im Zeitfenster
2. Setzt immer dort fort, wo sie aufgehört hat (lastPosition)
3. Erst wenn Fläche 100% abgedeckt → Job complete
4. Dann: Neuer Job, lastPosition = null, frische Fläche
