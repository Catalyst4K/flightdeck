/**
 * Throwaway spike (CLAUDE.md M1/M6 rule) for a planned feature: auto-starting tracking
 * once a flight is created in Dispatch, instead of requiring a manual "Start tracking"
 * click, by detecting from telemetry alone that a genuinely new flight has begun.
 *
 * The open question this is for: Callum has observed SimConnect keep reporting data
 * from the *previous* flight for a bit after loading a new one, before it catches up to
 * reality. Building an auto-start detector on an assumption about how long that lasts or
 * what specifically stays stale would be exactly the kind of guess that's bitten this
 * project before (see docs/decisions.md's stepClimbs entries) — so this logs the raw
 * transition instead of guessing.
 *
 * What to do with it:
 *   1. `npm run spike:flight-reload`
 *   2. While it's running, finish (or abandon) whatever flight is currently loaded, go
 *      back to the main menu, and load a genuinely different flight — different aircraft
 *      and/or different airport if possible, since that makes a real change easiest to
 *      spot in the log.
 *   3. Let it run for ~30s after the new flight is sitting at the gate, then Ctrl+C.
 *   4. Send back (or paste) `flight-reload-spike.log` from the project root, or just the
 *      few lines around the ">>> TITLE CHANGED" / ">>> ATC ID CHANGED" markers this
 *      prints when it notices one — those are the two candidate "this is definitely a
 *      new flight" signals being tested here, on the theory that they might update
 *      immediately even if position/on-ground/speed lag behind for a bit. If neither
 *      changes immediately either, that's just as useful to know.
 *
 * Not meant to survive as production code — delete once the real answer is known and
 * folded into TrackingController/a new detector module.
 */
import { appendFileSync, writeFileSync } from 'node:fs';
import {
    open,
    Protocol,
    SimConnectConstants,
    SimConnectDataType,
    SimConnectPeriod,
    type RawBuffer,
} from 'node-simconnect';

const APP_NAME = 'Flightdeck spike';
const DEFINITION_ID = 0;
const REQUEST_ID = 0;
const LOG_FILE = 'flight-reload-spike.log';

const INITIAL_RECONNECT_DELAY_MS = 2_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

interface SimVarSpec {
    key: string;
    name: string;
    unit: string | null;
    dataType: SimConnectDataType;
    read: (data: RawBuffer) => number | string | boolean;
}

const asBool = (data: RawBuffer): boolean => data.readInt32() === 1;

// Deliberately just the fields relevant to "did a new flight actually start" — not the
// full telemetry set SimConnectService already tracks.
const SIM_VARS: SimVarSpec[] = [
    { key: 'title', name: 'TITLE', unit: null, dataType: SimConnectDataType.STRING128, read: (d) => d.readString128() },
    { key: 'atcId', name: 'ATC ID', unit: null, dataType: SimConnectDataType.STRING32, read: (d) => d.readString32() },
    { key: 'onGround', name: 'SIM ON GROUND', unit: 'bool', dataType: SimConnectDataType.INT32, read: asBool },
    { key: 'groundSpeedKt', name: 'GROUND VELOCITY', unit: 'knots', dataType: SimConnectDataType.FLOAT64, read: (d) => d.readFloat64() },
    { key: 'engCombustion', name: 'ENG COMBUSTION:1', unit: 'bool', dataType: SimConnectDataType.INT32, read: asBool },
    { key: 'lat', name: 'PLANE LATITUDE', unit: 'degrees', dataType: SimConnectDataType.FLOAT64, read: (d) => d.readFloat64() },
    { key: 'lon', name: 'PLANE LONGITUDE', unit: 'degrees', dataType: SimConnectDataType.FLOAT64, read: (d) => d.readFloat64() },
    { key: 'altFt', name: 'INDICATED ALTITUDE', unit: 'feet', dataType: SimConnectDataType.FLOAT64, read: (d) => d.readFloat64() },
];

interface Sample {
    title: string;
    atcId: string;
    onGround: boolean;
    groundSpeedKt: number;
    engCombustion: boolean;
    lat: number;
    lon: number;
    altFt: number;
}

const startTime = Date.now();
let previous: Sample | undefined;

function log(line: string): void {
    console.log(line);
    appendFileSync(LOG_FILE, line + '\n');
}

function formatSample(s: Sample): string {
    const elapsedS = ((Date.now() - startTime) / 1000).toFixed(1);
    return (
        `${elapsedS.padStart(7)}s | onGround=${String(s.onGround).padEnd(5)} ` +
        `gs=${s.groundSpeedKt.toFixed(1).padStart(5)}kt eng=${String(s.engCombustion).padEnd(5)} ` +
        `alt=${s.altFt.toFixed(0).padStart(6)}ft lat=${s.lat.toFixed(4)} lon=${s.lon.toFixed(4)} ` +
        `title="${s.title}" atcId="${s.atcId}"`
    );
}

function handleSample(s: Sample): void {
    log(formatSample(s));
    if (previous) {
        if (previous.title !== s.title) {
            log(`>>> TITLE CHANGED: "${previous.title}" -> "${s.title}"`);
        }
        if (previous.atcId !== s.atcId) {
            log(`>>> ATC ID CHANGED: "${previous.atcId}" -> "${s.atcId}"`);
        }
    }
    previous = s;
}

function connectionOptions(): { remote: { host: string; port: number } } | undefined {
    const host = process.env['SIMCONNECT_HOST'];
    const port = process.env['SIMCONNECT_PORT'];
    if (!host || !port) return undefined;
    return { remote: { host, port: Number(port) } };
}

function connect(reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS): void {
    open(APP_NAME, Protocol.SunRise, connectionOptions())
        .then(({ recvOpen, handle }) => {
            log(`Connected: ${recvOpen.applicationName} (SimConnect ${recvOpen.simConnectVersionMajor}.${recvOpen.simConnectVersionMinor})`);
            let quitting = false;

            for (const [index, spec] of SIM_VARS.entries()) {
                handle.addToDataDefinition(DEFINITION_ID, spec.name, spec.unit, spec.dataType, 0, index);
            }

            handle.requestDataOnSimObject(
                REQUEST_ID,
                DEFINITION_ID,
                SimConnectConstants.OBJECT_ID_USER,
                SimConnectPeriod.SECOND
            );

            handle.on('simObjectData', (recv) => {
                if (recv.requestID !== REQUEST_ID) return;
                const fields: Record<string, unknown> = {};
                for (const spec of SIM_VARS) {
                    fields[spec.key] = spec.read(recv.data);
                }
                handleSample(fields as unknown as Sample);
            });

            handle.on('exception', (recvException) => {
                console.error(`SimConnect exception: ${recvException.exceptionName} (sendId ${recvException.sendId})`);
            });

            handle.on('quit', () => {
                log('Sim quit. Reconnecting...');
                quitting = true;
                handle.close();
                connect();
            });

            handle.on('close', () => {
                if (quitting) return;
                log('Connection closed unexpectedly. Reconnecting...');
                handle.close();
                connect();
            });

            process.on('SIGINT', () => {
                console.log(`\nShutting down. Log written to ${LOG_FILE}`);
                handle.close();
                process.exit(0);
            });
        })
        .catch((error: unknown) => {
            const code = error instanceof Error && 'code' in error ? String(error.code) : undefined;
            const description = code ?? (error instanceof Error ? error.message : String(error)) ?? 'unknown error';
            console.log(`Connection failed (${description}). Retrying in ${reconnectDelayMs / 1000}s...`);
            setTimeout(() => connect(Math.min(reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS)), reconnectDelayMs);
        });
}

writeFileSync(LOG_FILE, `Flight reload spike — started ${new Date().toISOString()}\n`);
connect();
