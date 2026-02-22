# DGX Spark + Isaac Lab + Jetson AGX Orin Pipeline

Autonomes Robot-Training Framework für Zeon Precision Agriculture Drones.

## Übersicht

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FOREMAN DASHBOARD                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  Training   │  │   Model     │  │ Deployment  │  │  Telemetry  │         │
│  │   Jobs      │  │  Registry   │  │  Pipeline   │  │   Monitor   │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
└─────────┼────────────────┼────────────────┼────────────────┼────────────────┘
          │                │                │                │
          ▼                ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         DGX SPARK (Training)                                 │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  NVIDIA Isaac Lab                                                     │   │
│  │  ├── Drone Navigation Environment                                    │   │
│  │  ├── Obstacle Avoidance Training                                     │   │
│  │  ├── Crop Detection RL                                               │   │
│  │  └── Multi-Agent Swarm Coordination                                  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│  GPU: Grace Hopper Superchip | Memory: 128GB Unified | Storage: 4TB NVMe    │
└─────────────────────────────────────────────────────────────────────────────┘
          │
          │ Model Export (ONNX → TensorRT)
          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      JETSON AGX ORIN (Inference)                             │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Isaac ROS + Trained Policy                                          │   │
│  │  ├── Real-time Obstacle Avoidance                                    │   │
│  │  ├── Autonomous Navigation                                           │   │
│  │  └── Telemetry → Foreman                                             │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│  GPU: Ampere 2048 CUDA | Memory: 64GB | Power: 15-60W                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Projektstruktur

```
dgx-isaac-jetson/
├── README.md
├── docs/
│   ├── 01-dgx-spark-setup.md       # Hardware + OS Setup
│   ├── 02-isaac-lab-setup.md       # Isaac Lab Installation
│   ├── 03-training-architecture.md # Training Pipeline Design
│   ├── 04-jetson-deployment.md     # Model Export + Inference
│   └── 05-foreman-integration.md   # Dashboard + Agent Rollen
├── scripts/
│   ├── dgx-initial-setup.sh        # Basis OS + Drivers
│   ├── dgx-isaac-install.sh        # Isaac Lab Container
│   ├── dgx-dev-environment.sh      # VS Code Remote, Jupyter
│   └── jetson-prepare.sh           # JetPack + Inference
├── dag-specification.json          # Foreman DAG für Implementierung
├── envs/                           # Isaac Lab Custom Environments
│   └── zeon_drone/                 # Drohnen-spezifische Envs
├── configs/                        # Training Configs
│   ├── ppo_drone_nav.yaml
│   └── sac_obstacle.yaml
└── models/                         # Exported Models
    └── .gitkeep
```

## Quick Start

### Phase 1: DGX Spark einrichten
```bash
# SSH zum DGX Spark
ssh admin@dgx-spark.zeon.local

# Initial Setup ausführen
curl -sSL https://raw.githubusercontent.com/zeon/dgx-setup/main/dgx-initial-setup.sh | bash

# Isaac Lab installieren
./scripts/dgx-isaac-install.sh
```

### Phase 2: Training starten
```bash
# Via Foreman CLI
foreman training start --env zeon_drone_nav --config configs/ppo_drone_nav.yaml

# Oder direkt auf DGX
docker exec -it isaac-lab python train.py --task ZeonDroneNav-v1
```

### Phase 3: Model deployen
```bash
# Export nach ONNX
foreman model export --run wandb://zeon/drone-nav/run_xyz --format onnx

# Deploy auf Jetson
foreman deploy --model drone_nav_v1.onnx --target jetson-orin-01
```

## Foreman Integration

### Neue Agent-Rollen

| Rolle | Beschreibung |
|-------|--------------|
| `training-orchestrator` | SSH zu DGX, startet Isaac Lab Jobs, monitort Progress |
| `model-evaluator` | Vergleicht Training Runs, erstellt Evaluation Reports |
| `deployment-manager` | Managed Jetson Fleet, OTA Updates, Health Checks |

### Dashboard Views

- **Training Jobs**: Live Loss/Reward Curves, Episode Stats, GPU Utilization
- **Model Registry**: Versionierte Models mit Metriken, Lineage
- **Deployment Pipeline**: Jetson Fleet Status, OTA Progress, Telemetry

## Hardware Requirements

| Component | Specification | Est. Cost |
|-----------|---------------|-----------|
| DGX Spark | Grace Hopper, 128GB | ~$25,000 |
| Jetson AGX Orin | 64GB Developer Kit | ~$2,000 |
| 10GbE Switch | für DGX ↔ Workstation | ~$500 |
| NVMe Storage | 4TB für Datasets | ~$400 |

## Timeline

```
Week 1-2:  DGX Spark Setup + Isaac Lab Installation
Week 3-4:  Custom Drone Environment Development
Week 5-6:  Training Pipeline + Wandb Integration
Week 7-8:  Jetson Deployment + OTA System
Week 9-10: Foreman Dashboard Integration
Week 11-12: Testing + Documentation
```

## Links

- [NVIDIA Isaac Lab](https://isaac-sim.github.io/IsaacLab/)
- [DGX Spark Documentation](https://docs.nvidia.com/dgx/)
- [Jetson AGX Orin](https://developer.nvidia.com/embedded/jetson-agx-orin)
- [Isaac ROS](https://nvidia-isaac-ros.github.io/)
