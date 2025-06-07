declare module 'carbone-sdk' {
  interface CarboneSDK {
    renderPromise(templateId: string, options: {
      data: any;
      convertTo: string;
    }): Promise<{
      content: Buffer;
      filename: string;
    }>;
  }

  function carboneSDK(apiKey: string): CarboneSDK;
  export default carboneSDK;
} 