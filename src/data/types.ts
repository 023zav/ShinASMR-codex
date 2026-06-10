import { z } from "zod";

export const StationSchema = z.object({
  id: z.string(),
  name_en: z.string(),
  name_local: z.string().optional(),
  lat: z.number(),
  lon: z.number(),
  line_ids: z.array(z.string()),
  metadata: z.record(z.unknown()).optional()
});

export const LineSchema = z.object({
  id: z.string(),
  name_en: z.string(),
  polyline: z.array(z.tuple([z.number(), z.number()])),
  station_ids_in_order: z.array(z.string())
});

export const TrainTypeSchema = z.object({
  id: z.string(),
  name_en: z.string(),
  max_speed_kmh: z.number(),
  length_m: z.number(),
  livery_key: z.string(),
  facts_en: z.array(z.string())
});

export const ServiceSchema = z.object({
  id: z.string(),
  line_id: z.string(),
  train_type_id: z.string(),
  name_en: z.string(),
  stops: z.array(
    z.object({
      station_id: z.string(),
      arrival: z.string(),
      departure: z.string()
    })
  )
});

export const StationsSchema = z.array(StationSchema);
export const LinesSchema = z.array(LineSchema);
export const TrainTypesSchema = z.array(TrainTypeSchema);
export const ServicesSchema = z.array(ServiceSchema);

export const DerivedRuntimeSchema = z.object({
  line_runtime: z.array(
    z.object({
      id: z.string(),
      total_length_m: z.number(),
      cumulative_lengths_m: z.array(z.number()),
      station_offsets_m: z.record(z.number())
    })
  )
});

export type Station = z.infer<typeof StationSchema>;
export type Line = z.infer<typeof LineSchema>;
export type TrainType = z.infer<typeof TrainTypeSchema>;
export type Service = z.infer<typeof ServiceSchema>;
export type DerivedRuntime = z.infer<typeof DerivedRuntimeSchema>;
