---
categories: 
- X++
- C#
tags:
- X++
- C#
---
## Integrate Apache Kafka Client into Microsoft Dynamics 365 Finance and Operations, Supply Chain Management
"Apache Kafka is an open-source distributed event streaming platform used by thousands of companies for high-performance data pipelines, streaming analytics, data integration, and mission-critical applications." [Apache Kafka](https://kafka.apache.org/).
Kafka is similar to Azure Service Bus Queue, which I am sure you will find enough examples on how to integrate with D365. In this post I will show you one possible way on how to integrate Kafka into D365 F&O/SCM.

## Confluent Kafka C# .NET Client
You will need to either create a new C# Project to build a DLL which you can reference, or just create plain reference the Kafka DLL provided in this [.NET Client Installation tutorial](https://docs.confluent.io/kafka-clients/dotnet/current/overview.html#dotnet-installation).
I decided to create a new C# Project that builds into a library, which then is referenced by my X++ code.

### Config (C#)
Depending on what type of authentication you use with your Kafka deployment, you will have to adjust the code below. In my scenario, a plain SASL authentication was used.
```csharp
namespace KafkaClient
{
    using Confluent.Kafka;

    public class Config
    {
        public string BootstrapServers { get; set; }

        private SecurityProtocol SecurityProtocol { get; set; } = SecurityProtocol.SaslSsl;

        private SaslMechanism SaslMechanism { get; set; } = SaslMechanism.Plain;

        public string SaslUsername { get; set; }

        public string SaslPassword { get; set; }

        public ClientConfig GetClientConfig()
        {
            return new ClientConfig()
            {
                BootstrapServers = BootstrapServers,
                SecurityProtocol = SecurityProtocol,
                SaslMechanism = SaslMechanism,
                SaslUsername = SaslUsername,
                SaslPassword = SaslPassword
            };
        }
    }
}
```

### Root Store / SSL CA certificate check
This was the biggest issue I was facing when trying to integrate Kafka into DFO. I was testing my integration the whole time on my DEV machine, everything was working there as expected. What I missed when I deployed my development to a Tier2+ machine (UAT), that these sandbox environments are completley missing a root store where the root CA certificates are stored. The confluent Kafka client uses this root store to check the SSL connection, and since this root store is not available, it will result in an error message:

sasl_ssl://pkc-1wvvj.westeurope.azure.confluent.cloud:9092/bootstrap: SSL handshake failed: error:0A000086:SSL routines::certificate verify failed: broker certificate could not be verified, verify that ssl.ca.location is correctly configured or root CA certificates are installed (add broker's CA certificate to the Windows Root certificate store) (after 15ms in state SSL_HANDSHAKE)

After some research, I found that the Confluent Kafka Client actually supports SSL PEM certificate strings. So the way I solved this, was before a producer/consumer actually established the connection with the broker, i made an extra call to the broker to download its certificate chain and looped these until I found the self signed one (which respresents the CA root certifificate of the certificate chain).

```csharp
namespace KafkaClient
{
    using System;
    using System.Net.Http;
    using System.Security.Cryptography.X509Certificates;
    using System.Text;
    using System.Threading;

    class ServerCertificateHandler
    {
        public static string GetRootCAPemStringFromUrl(string url)
        {
            string selfSignedPEMCert = "";

            if (!url.StartsWith("https://"))
            {
                url = "https://" + url;
            }

            using (var cancelToken = new CancellationTokenSource())
            {
                var handler = new WebRequestHandler
                {
                    ServerCertificateValidationCallback = (sender, cert, chain, error) =>
                    {
                        foreach (var certificate in chain.ChainElements)
                        {
                            // check if CA is self signed => Root CA
                            if (certificate.Certificate.Subject == certificate.Certificate.Issuer)
                            {
                                selfSignedPEMCert = GeneratePEMString(certificate.Certificate);

                                // cancel request at this point, we only need the self signed root CA certificate from the chain
                                cancelToken.Cancel();
                            }
                        }

                        return true;
                    }
                };

                try
                {
                    using (var client = new HttpClient(handler))
                    {
                        using (var response = client.GetAsync(url, cancelToken.Token).Result)
                        {
                            return selfSignedPEMCert;
                        }
                    }
                }
                catch { }
            }

            return selfSignedPEMCert;
        }

        private static string GeneratePEMString(X509Certificate2 cert)
        {
            StringBuilder builder = new StringBuilder();

            builder.AppendLine("-----BEGIN CERTIFICATE-----");
            builder.AppendLine(Convert.ToBase64String(cert.Export(X509ContentType.Cert), Base64FormattingOptions.InsertLineBreaks));
            builder.AppendLine("-----END CERTIFICATE-----");

            return builder.ToString();
        }
    }
}
```

This way we can pass the root CA certificate in memory to the Conluent Kafka Client without providing a root store where the certificate could be looked up.

### Consumer (C#)
To be able to consume message from kafka topic(s), you will need to implement the consumer logic. This is how I did it. The consumer will be configured from a X++ sysoperation service class, that passes parameters to the consumer, like the duration the consumer will listen for new messages until any resources will be freed again and the batch operation restarts. Also, if needed, a topics offset can be set to the beginning, so you will be able to read all messages from the very beginning. Once a message is read, the message will be commited and thus the offset will be set to this message, so any restart of the consumer will not result in fetching the same messages again. KafkaMessageProcessorInterface_BEC is a X++ class that is invoked from C#, that handles the incoming messages based on the topics name and the payload of the message. Refer to this if you want to know how to call X++ code from C#: [Write business logic by using C# and X++ source code](https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/dev-tools/write-business-logic) 
```csharp
namespace KafkaClient
{
    using Confluent.Kafka;

    using Dynamics.AX.Application;

    using System;
    using System.Collections.Generic;
    using System.Linq;
    using System.Threading;

    public class Consumer
    {
        public Config Config { get; set; }

        public string GroupId { get; set; }
        public bool OffsetBeginning { get; set; }
        public int SecondsBeforeTimeout { get; set; }

        private readonly List<string> TopicSubscriptionList = new List<string>();
        

        public void SubscribeTopic(string topic)
        {
            TopicSubscriptionList.Add(topic);
        }

        public void Consume()
        {
            ConsumerConfig consumerConfig = new ConsumerConfig(Config.GetClientConfig())
            {
                GroupId = GroupId,
                EnableAutoCommit = false,
                AutoOffsetReset = AutoOffsetReset.Earliest
            };

            consumerConfig.SslCaPem = ServerCertificateHandler.GetRootCAPemStringFromUrl(consumerConfig.BootstrapServers);

            var consumerBuilder = new ConsumerBuilder<Ignore, string>(consumerConfig)
                .SetValueDeserializer(new CustomStringDeserializer());

            if (OffsetBeginning)
            { 
                consumerBuilder.SetPartitionsAssignedHandler((c, partitions) =>
                    {
                        var offsets = partitions.Select(tp => new TopicPartitionOffset(tp, Offset.Beginning));
                        return offsets;
                    }
                );
            }

            using (var consumer = consumerBuilder.Build())
            {
                consumer.Subscribe(TopicSubscriptionList); 

                CancellationTokenSource cts = new CancellationTokenSource();
                cts.CancelAfter(TimeSpan.FromSeconds(SecondsBeforeTimeout));

                try
                {
                    while (! cts.Token.IsCancellationRequested)
                    {
                        var message = consumer.Consume(cts.Token);

                        bool success = KafkaMessageProcessorInterface_BEC.process(message.Topic, message.Message.Value);

                        if (success)
                        { 
                            consumer.Commit(message);
                        }
                    }
                }
                catch (OperationCanceledException)
                { 
                    // this is expected: timeout error
                }
                finally
                {
                    consumer.Close();
                }
            }
        }
    }
}
```

### Consumer: CustomStringDeserializer (C#)
Since every message that is produced to a kafka topic will start with a preceding magic byte before the actual payload, you will need a custom string deserializer like this that filters out said magic byte first:
```csharp
namespace KafkaClient
{
    using System;
    using System.Text;
    using Confluent.Kafka;

    public class CustomStringDeserializer : IDeserializer<string>
    {
        private readonly int headerSize = sizeof(int) + sizeof(byte);
        private readonly byte magicByte = 0;

        public string Deserialize(ReadOnlySpan<byte> data, bool isNull, SerializationContext context)
        {
            if (isNull) return null;

            if (data.Length > 0 && data[0] == magicByte)
            {
                data = data.Slice(headerSize);
            }
            return Encoding.UTF8.GetString(data.ToArray());
        }
    }
}
```

### Consumer SysOperationService Class
This is the class used to trigger the consumation part from within X++. I have set the seconds before timeout to like 5 mins and the recurrence to 1 min, since you shouldn't block the system with any batch process that run endlessly.
```axapta
public final class KafkaMessageProcessorService_BEC extends SysOperationServiceBase
{
    KafkaParameters_BEC parameters = KafkaParameters_BEC::find();

    public void process(KafkaMessageProcessorContract_BEC _contract)
    {
        KafkaClient.Config config = new KafkaClient.Config();
        config.BootstrapServers = parameters.ConnectionBootstrapServers;
        config.SaslUsername = parameters.ConnectionSaslUsername;
        config.SaslPassword = parameters.decryptSaslPassword();

        KafkaClient.Consumer consumer = new KafkaClient.Consumer();
        consumer.Config = config;
        consumer.GroupId = parameters.ConsumerGroupId;
        consumer.OffsetBeginning = _contract.parmOffsetBeginning() == NoYes::Yes;
        consumer.SecondsBeforeTimeout = _contract.parmRunTimeInSeconds();

        container topicCon;

        KafkaMessageProcessorTypeInbound_BEC processorType;
        while select processorType
            where   processorType.Enabled &&
                    (!_contract.parmMessageType() || processorType.MessageTypeId == _contract.parmMessageType())
        {
            topicCon += processorType.TopicName;

            consumer.SubscribeTopic(processorType.TopicName);
        }

        if (conLen(topicCon) != 0)
        {
            consumer.Consume();
        }
    }
}
```

### Producer (C#)
The producer will reuse the same config class that can be passed from X++. With this class you will be able to produce your messages to any kafka topic.
```csharp
namespace KafkaClient
{
    using Confluent.Kafka;

    public class Producer
    {
        public Config Config { get; set; }

        public void ProduceMessage(string topic, string payload)
        {
            ProducerConfig producerConfig = new ProducerConfig(Config.GetClientConfig());
            producerConfig.SslCaPem = ServerCertificateHandler.GetRootCAPemStringFromUrl(producerConfig.BootstrapServers);

            using (var producer = new ProducerBuilder<string, string>(producerConfig)
                .SetValueSerializer(Serializers.Utf8)
                .Build()
            )
            {
                var message = new Message<string, string>()
                { 
                    Value = payload
                };

                producer.Produce(topic, message);
            }
        }
    }    
}
```

### Producer: Business Event to Kafka 
For the message producing part, I used the the existing business events framework integrated into DFO. For this, I created my own business event endpoint. How to create your own business events endpoints: [Business events developer documentation](https://learn.microsoft.com/en-us/dynamics365/fin-ops-core/dev-itpro/business-events/business-events-dev-doc)
I will spare you with any Enum, Forms or Tables involved to create such a business endpoint, you can refer to the guide. So here is just the class I created:
```axapta
using KafkaClient;

[BusinessEventsEndpoint(BusinessEventsEndpointType::Kafka_BEC)]
public final class BusinessEventsKafkaAdapter_BEC extends BusinessEventsEndpointBase implements IBusinessEventsEndpoint
{
    Producer producer;
    str topic;

    public void initialize(BusinessEventsEndpoint _endpoint, boolean _forceCreate)
    {
        this.endpoint = _endpoint;  

        BusinessEventsKafkaEndpoint_BEC kafkaEndpoint = _endpoint as BusinessEventsKafkaEndpoint_BEC;

        topic = kafkaEndpoint.KafkaTopicName;
      
        Config config = new Config();
        config.BootstrapServers = kafkaEndpoint.BootstrapServers;
        config.SaslUsername = kafkaEndpoint.SaslUsername;
        config.SaslPassword = kafkaEndpoint.decryptSaslPassword();       

        producer = new Producer();
        producer.Config = Config;
    }

    protected void sendPayload(str _payload, BusinessEventsEndpointPayloadContext _context)
    {
        producer.ProduceMessage(topic, _payload);
    }

    public boolean isTransient(System.Exception _exception)
    {
        if (_exception is System.TimeoutException)
        {
            return true;
        }

        return false;
    }
}
```

Feel free to ask any questions.
