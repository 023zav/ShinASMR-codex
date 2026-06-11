// sharp ships CJS-resolved typings that tsc cannot see through its "exports"
// map under our bundler resolution; the generation scripts run via tsx where
// this does not matter.
declare module "sharp";
