//! Standard MIDI File (format 0) export of a recorded session.

use crate::db::MidiEventRecord;

/// Encode events as a single-track MIDI file at 120 BPM, 480 ticks per beat.
/// A velocity of 0 is written as a note-off.
pub fn build(events: &[MidiEventRecord]) -> Vec<u8> {
    let ticks_per_beat: u16 = 480;
    let tempo_us: u32 = 500_000; // 120 BPM
    let ms_per_tick = tempo_us as f64 / 1000.0 / ticks_per_beat as f64;

    let mut track: Vec<u8> = Vec::new();

    // Tempo meta event at tick 0: delta=0, FF 51 03 <3-byte tempo>
    write_var_len(&mut track, 0);
    track.extend_from_slice(&[0xFF, 0x51, 0x03]);
    track.push(((tempo_us >> 16) & 0xFF) as u8);
    track.push(((tempo_us >> 8) & 0xFF) as u8);
    track.push((tempo_us & 0xFF) as u8);

    let mut last_tick: u32 = 0;
    for ev in events {
        let abs_tick = (ev.relative_ms as f64 / ms_per_tick).round() as u32;
        let delta = abs_tick.saturating_sub(last_tick);
        last_tick = abs_tick;

        write_var_len(&mut track, delta);
        let status_byte = if ev.velocity > 0 {
            0x90 | (ev.channel & 0x0F)
        } else {
            0x80 | (ev.channel & 0x0F)
        };
        track.extend_from_slice(&[status_byte, ev.note, ev.velocity]);
    }

    // End of track: delta=0, FF 2F 00
    write_var_len(&mut track, 0);
    track.extend_from_slice(&[0xFF, 0x2F, 0x00]);

    let mut out: Vec<u8> = Vec::new();
    // MIDI header chunk
    out.extend_from_slice(b"MThd");
    out.extend_from_slice(&6u32.to_be_bytes());
    out.extend_from_slice(&0u16.to_be_bytes()); // format 0
    out.extend_from_slice(&1u16.to_be_bytes()); // 1 track
    out.extend_from_slice(&ticks_per_beat.to_be_bytes());
    // Track chunk
    out.extend_from_slice(b"MTrk");
    out.extend_from_slice(&(track.len() as u32).to_be_bytes());
    out.extend_from_slice(&track);
    out
}

fn write_var_len(buf: &mut Vec<u8>, mut val: u32) {
    let mut bytes = [0u8; 4];
    let mut count = 0;
    loop {
        bytes[count] = (val & 0x7F) as u8;
        count += 1;
        val >>= 7;
        if val == 0 { break; }
    }
    for i in (0..count).rev() {
        let b = if i > 0 { bytes[i] | 0x80 } else { bytes[i] };
        buf.push(b);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encodes_header_track_and_variable_length_deltas() {
        let events = [
            MidiEventRecord { relative_ms: 0, note: 60, velocity: 80, channel: 0 },
            MidiEventRecord { relative_ms: 500, note: 60, velocity: 0, channel: 0 },
        ];
        let bytes = build(&events);
        assert_eq!(&bytes[0..4], b"MThd");
        assert_eq!(&bytes[14..18], b"MTrk");
        let track = &bytes[22..];
        // Tempo, note-on at tick 0, note-off 480 ticks later (two-byte delta), end of track.
        assert_eq!(&track[7..11], &[0x00, 0x90, 60, 80]);
        assert_eq!(&track[11..16], &[0x83, 0x60, 0x80, 60, 0]);
        assert_eq!(&track[16..], &[0x00, 0xFF, 0x2F, 0x00]);
    }

    #[test]
    fn variable_length_quantities() {
        for (value, expected) in [(0u32, vec![0x00]), (127, vec![0x7F]), (128, vec![0x81, 0x00]), (0x3FFF, vec![0xFF, 0x7F])] {
            let mut buf = Vec::new();
            write_var_len(&mut buf, value);
            assert_eq!(buf, expected);
        }
    }
}
