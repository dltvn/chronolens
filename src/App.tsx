import { useMemo, useState } from "react";
import { Ghost, Loader2, MoveRight, Split, User } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  predictAllWithCrop,
  type AgeAgnosticWithCropResponse,
  type RaceWithCropResponse,
  type GenderSpecificWithCropResponse,
  type GenderWithCropResponse,
} from "@/lib/api";

type ModelMode = "agnostic" | "specific" | "race";

const distributionConfig = {
  probability: {
    label: "Probability",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

const genderConfidenceConfig = {
  confidence: {
    label: "Confidence",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

const raceConfidenceConfig = {
  probability: {
    label: "Probability",
    color: "var(--chart-3)",
  },
} satisfies ChartConfig;

function toDataUrl(base64: string, mimeType: string) {
  return `data:${mimeType};base64,${base64}`;
}

function distributionToSeries(distribution: number[]) {
  return distribution.map((probability, age) => ({ age, probability }));
}

function plusMinusFiveConfidence(distribution: number[], age: number): number {
  const min = Math.max(0, age - 5);
  const max = Math.min(distribution.length - 1, age + 5);
  let total = 0;
  for (let i = min; i <= max; i += 1) {
    total += distribution[i] ?? 0;
  }
  return total;
}

export default function App() {
  const [mode, setMode] = useState<ModelMode>("agnostic");
  const [originalSrc, setOriginalSrc] = useState<string | null>(null);

  const [uploadResult, setUploadResult] = useState<GenderWithCropResponse | null>(
    null
  );
  const [agnosticResult, setAgnosticResult] =
    useState<AgeAgnosticWithCropResponse | null>(null);
  const [specificResult, setSpecificResult] =
    useState<GenderSpecificWithCropResponse | null>(null);
  const [raceResult, setRaceResult] = useState<RaceWithCropResponse | null>(null);

  const [errors, setErrors] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const croppedImageSrc = useMemo(() => {
    if (uploadResult) {
      return toDataUrl(
        uploadResult.cropped_image_base64,
        uploadResult.cropped_image_mime_type
      );
    }
    if (mode === "agnostic" && agnosticResult) {
      return toDataUrl(
        agnosticResult.cropped_image_base64,
        agnosticResult.cropped_image_mime_type
      );
    }
    if (mode === "specific" && specificResult) {
      return toDataUrl(
        specificResult.cropped_image_base64,
        specificResult.cropped_image_mime_type
      );
    }
    if (mode === "race" && raceResult) {
      return toDataUrl(
        raceResult.cropped_image_base64,
        raceResult.cropped_image_mime_type
      );
    }
    return null;
  }, [uploadResult, agnosticResult, specificResult, raceResult, mode]);

  const agnosticSeries = useMemo(
    () =>
      agnosticResult ? distributionToSeries(agnosticResult.distribution) : [],
    [agnosticResult]
  );

  const specificSeries = useMemo(
    () => (specificResult ? distributionToSeries(specificResult.distribution) : []),
    [specificResult]
  );

  const agnosticRangeConfidence = useMemo(() => {
    if (!agnosticResult) return null;
    return plusMinusFiveConfidence(
      agnosticResult.distribution,
      agnosticResult.predicted_age
    );
  }, [agnosticResult]);

  const specificRangeConfidence = useMemo(() => {
    if (!specificResult) return null;
    return plusMinusFiveConfidence(
      specificResult.distribution,
      specificResult.predicted_age
    );
  }, [specificResult]);

  const genderConfidenceSeries = useMemo(() => {
    if (!specificResult) return [];
    const c = specificResult.gender_confidence;
    return specificResult.gender === "male"
      ? [
          { label: "Male", confidence: c },
          { label: "Female", confidence: 1 - c },
        ]
      : [
          { label: "Female", confidence: c },
          { label: "Male", confidence: 1 - c },
        ];
  }, [specificResult]);

  const raceConfidenceSeries = useMemo(() => {
    if (!raceResult) return [];
    return Object.entries(raceResult.probabilities)
      .map(([label, probability]) => ({ label, probability }))
      .sort((a, b) => b.probability - a.probability);
  }, [raceResult]);

  const genderTheme = useMemo(() => {
    if (uploadResult?.gender === "male" || uploadResult?.gender === "female") {
      return uploadResult.gender;
    }
    if (specificResult?.gender === "male" || specificResult?.gender === "female") {
      return specificResult.gender;
    }
    return "default";
  }, [uploadResult, specificResult]);

  const runAllEndpoints = async (imageFile: File) => {
    setErrors([]);
    setIsProcessing(true);
    setUploadResult(null);
    setAgnosticResult(null);
    setSpecificResult(null);
    setRaceResult(null);

    try {
      const combined = await predictAllWithCrop(imageFile);
      const sharedCrop = {
        cropped_image_base64: combined.cropped_image_base64,
        cropped_image_mime_type: combined.cropped_image_mime_type,
      };

      setUploadResult({
        gender: combined.gender.gender,
        confidence: combined.gender.confidence,
        prob_female: combined.gender.prob_female,
        prob_male: combined.gender.prob_male,
        ...sharedCrop,
      });

      setAgnosticResult({
        predicted_age: combined.age_agnostic.predicted_age,
        confidence: combined.age_agnostic.confidence,
        distribution: combined.age_agnostic.distribution,
        ...sharedCrop,
      });

      setSpecificResult({
        gender: combined.gender.gender,
        gender_confidence: combined.gender.confidence,
        predicted_age: combined.age_gender_specific.predicted_age,
        confidence: combined.age_gender_specific.confidence,
        distribution: combined.age_gender_specific.distribution,
        ...sharedCrop,
      });

      setRaceResult({
        race: combined.race.race,
        confidence: combined.race.confidence,
        probabilities: combined.race.probabilities,
        ...sharedCrop,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      setErrors([`Combined endpoint failed: ${message}`]);
    } finally {
      setIsProcessing(false);
    }
  };

  const onFileSelected = async (next: File | null) => {
    if (!next) {
      setOriginalSrc(null);
      setErrors([]);
      setUploadResult(null);
      setAgnosticResult(null);
      setSpecificResult(null);
      setRaceResult(null);
      setIsProcessing(false);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setOriginalSrc(String(reader.result));
    reader.readAsDataURL(next);

    await runAllEndpoints(next);
  };

  return (
    <main
      data-gender-theme={genderTheme}
      className="min-h-svh w-full bg-gradient-to-b from-background via-background to-muted/30"
    >
      <nav className="sticky top-0 z-20 w-full border-b bg-background/90 backdrop-blur">
        <div className="flex w-full flex-col gap-4 px-4 py-4 md:flex-row md:items-end md:justify-between md:px-8">
          <div className="flex items-center gap-3">
            <img src="/chronolens.png" alt="Chronolens logo" className="h-9 w-9 rounded-lg object-cover shadow-md" />
            <div>
              <p className="text-xs tracking-[0.16em] text-muted-foreground uppercase">
                Face Intelligence
              </p>
              <h1 className="text-xl font-semibold tracking-tight">Chronolens</h1>
            </div>
          </div>

          <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-end">
            <div className="grid w-full gap-2 md:w-[360px]">
              <Label htmlFor="image" className="text-xs uppercase">
                Upload image
              </Label>
              <Input
                id="image"
                type="file"
                accept="image/*"
                onChange={(e) => void onFileSelected(e.target.files?.[0] ?? null)}
              />
            </div>

            <div className="grid w-full gap-2 md:w-[220px]">
              <Label htmlFor="mode" className="text-xs uppercase">
                Model output
              </Label>
              <select
                id="mode"
                value={mode}
                onChange={(e) => setMode(e.target.value as ModelMode)}
                className="h-8 rounded-lg border bg-background px-3 text-sm"
              >
                <option value="agnostic">Gender Agnostic</option>
                <option value="specific">Gender Specific</option>
                <option value="race">Race</option>
              </select>
            </div>
          </div>
        </div>
      </nav>

      <section className="w-full px-4 py-6 md:px-8 md:py-8">
        {errors.length > 0 ? (
          <Alert variant="destructive" className="mb-6">
            <AlertTitle>Some requests failed</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-5">
                {errors.map((msg) => (
                  <li key={msg}>{msg}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="mb-6 grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Original Image</CardTitle>
            </CardHeader>
            <CardContent>
              {originalSrc ? (
                <img
                  src={originalSrc}
                  alt="Original"
                  className="h-96 w-full rounded-xl border object-contain"
                />
              ) : (
                <div className="flex h-96 flex-col items-center justify-center rounded-xl border text-muted-foreground">
                  <User className="mb-3 h-10 w-10 opacity-70" />
                  <p className="text-sm">No image uploaded yet</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cropped + Aligned Image</CardTitle>
            </CardHeader>
            <CardContent>
              {croppedImageSrc ? (
                <img
                  src={croppedImageSrc}
                  alt="Cropped"
                  className="h-96 w-full rounded-xl border object-contain"
                />
              ) : isProcessing ? (
                <div className="flex h-96 items-center justify-center rounded-xl border">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="flex h-96 flex-col items-center justify-center rounded-xl border text-muted-foreground">
                  <Ghost className="mb-3 h-10 w-10 opacity-70" />
                  <p className="text-sm">No cropped face yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {mode === "agnostic" ? (
          <>
            <div className="mb-6">
              <h2 className="text-2xl font-semibold">Gender-Agnostic Output</h2>
              <p className="text-sm text-muted-foreground">
                Single-model pipeline: one age network predicts the full age
                distribution directly from the cropped face, without gender routing.
                Confidence is aggregated from the predicted distribution.
              </p>
            </div>

            {agnosticResult ? (
              <>
                <div className="mb-6 grid gap-6 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardDescription>Predicted Age</CardDescription>
                      <CardTitle className="text-4xl">
                        {agnosticResult.predicted_age}
                      </CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardDescription>Confidence (±5 years)</CardDescription>
                      <CardTitle className="text-4xl">
                        {agnosticRangeConfidence !== null
                          ? `${(agnosticRangeConfidence * 100).toFixed(2)}%`
                          : "--"}
                      </CardTitle>
                    </CardHeader>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Age Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer
                      config={distributionConfig}
                      className="h-[360px] w-full"
                    >
                      <AreaChart data={agnosticSeries}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="age" tickMargin={8} interval={9} />
                        <YAxis tickMargin={8} />
                        <ChartTooltip
                          content={
                            <ChartTooltipContent
                              labelFormatter={(_, payload) => {
                                const age = (
                                  payload?.[0] as
                                    | { payload?: { age?: number } }
                                    | undefined
                                )?.payload?.age;
                                return typeof age === "number"
                                  ? `Age: ${age}`
                                  : "Age";
                              }}
                            />
                          }
                        />
                        <Area
                          dataKey="probability"
                          type="monotone"
                          fill="var(--color-probability)"
                          stroke="var(--color-probability)"
                          fillOpacity={0.24}
                          strokeWidth={2.5}
                        />
                      </AreaChart>
                    </ChartContainer>
                  </CardContent>
                </Card>
              </>
            ) : (
              <div className="flex h-32 flex-col items-center justify-center rounded-xl border text-muted-foreground">
                {isProcessing ? (
                  <Loader2 className="h-8 w-8 animate-spin" />
                ) : (
                  <>
                    <MoveRight className="mb-2 h-8 w-8 opacity-70" />
                    <p className="text-sm">Upload an image to run age-only inference</p>
                  </>
                )}
              </div>
            )}
          </>
        ) : mode === "specific" ? (
          <>
            <div className="mb-6">
              <h2 className="text-2xl font-semibold">Gender-Specific Output</h2>
              <p className="text-sm text-muted-foreground">
                Hierarchical pipeline: a gender classifier runs first, then the
                image is routed to the matching age model (male or female) to
                produce the age distribution.
              </p>
            </div>

            {specificResult ? (
              <>
                <div className="mb-6 grid gap-6 md:grid-cols-3">
                  <Card>
                    <CardHeader>
                      <CardDescription>Predicted Gender</CardDescription>
                      <CardTitle className="text-4xl uppercase">
                        {specificResult.gender}
                      </CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardDescription>Predicted Age</CardDescription>
                      <CardTitle className="text-4xl">
                        {specificResult.predicted_age}
                      </CardTitle>
                    </CardHeader>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardDescription>Confidence (±5 years)</CardDescription>
                      <CardTitle className="text-4xl">
                        {specificRangeConfidence !== null
                          ? `${(specificRangeConfidence * 100).toFixed(2)}%`
                          : "--"}
                      </CardTitle>
                    </CardHeader>
                  </Card>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Gender Confidence</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ChartContainer
                        config={genderConfidenceConfig}
                        className="h-[260px] w-full"
                      >
                        <BarChart data={genderConfidenceSeries}>
                          <CartesianGrid vertical={false} />
                          <XAxis dataKey="label" />
                          <YAxis
                            tickFormatter={(v) => `${(Number(v) * 100).toFixed(0)}%`}
                          />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar
                            dataKey="confidence"
                            fill="var(--color-confidence)"
                            radius={10}
                          />
                        </BarChart>
                      </ChartContainer>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Age Distribution</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ChartContainer
                        config={distributionConfig}
                        className="h-[260px] w-full"
                      >
                        <AreaChart data={specificSeries}>
                          <CartesianGrid vertical={false} />
                          <XAxis dataKey="age" tickMargin={8} interval={9} />
                          <YAxis tickMargin={8} />
                          <ChartTooltip
                            content={
                              <ChartTooltipContent
                                labelFormatter={(_, payload) => {
                                  const age = (
                                    payload?.[0] as
                                      | { payload?: { age?: number } }
                                      | undefined
                                  )?.payload?.age;
                                  return typeof age === "number"
                                    ? `Age: ${age}`
                                    : "Age";
                                }}
                              />
                            }
                          />
                          <Area
                            dataKey="probability"
                            type="monotone"
                            fill="var(--color-probability)"
                            stroke="var(--color-probability)"
                            fillOpacity={0.24}
                            strokeWidth={2.5}
                          />
                        </AreaChart>
                      </ChartContainer>
                    </CardContent>
                  </Card>
                </div>
              </>
            ) : (
              <div className="flex h-32 flex-col items-center justify-center rounded-xl border text-muted-foreground">
                {isProcessing ? (
                  <Loader2 className="h-8 w-8 animate-spin" />
                ) : (
                  <>
                    <Split className="mb-2 h-8 w-8 rotate-90 opacity-70" />
                    <p className="text-sm">
                      Upload an image to run hierarchical gender-to-age inference
                    </p>
                  </>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="mb-6">
              <h2 className="text-2xl font-semibold">Race Output</h2>
              <p className="text-sm text-muted-foreground">
                Multi-class pipeline: one race classifier predicts class
                probabilities from the cropped face.
              </p>
            </div>

            {raceResult ? (
              <>
                <div className="mb-6 grid gap-6 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardDescription>Predicted Class</CardDescription>
                      <CardTitle className="text-4xl uppercase">
                        {raceResult.race}
                      </CardTitle>
                    </CardHeader>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardDescription>Top-Class Confidence</CardDescription>
                      <CardTitle className="text-4xl">
                        {(raceResult.confidence * 100).toFixed(2)}%
                      </CardTitle>
                    </CardHeader>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>Race Class Probabilities</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer
                      config={raceConfidenceConfig}
                      className="h-[360px] w-full"
                    >
                      <BarChart data={raceConfidenceSeries}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="label" />
                        <YAxis
                          tickFormatter={(v) => `${(Number(v) * 100).toFixed(0)}%`}
                        />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar
                          dataKey="probability"
                          fill="var(--color-probability)"
                          radius={10}
                        />
                      </BarChart>
                    </ChartContainer>
                  </CardContent>
                </Card>
              </>
            ) : (
              <div className="flex h-32 flex-col items-center justify-center rounded-xl border text-muted-foreground">
                {isProcessing ? (
                  <Loader2 className="h-8 w-8 animate-spin" />
                ) : (
                  <>
                    <MoveRight className="mb-2 h-8 w-8 opacity-70" />
                    <p className="text-sm">Upload an image to run race inference</p>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
