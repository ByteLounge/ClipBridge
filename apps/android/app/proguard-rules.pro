# General Kotlin and Coroutines rules
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod,SourceFile,LineNumberTable
-dontwarn kotlinx.coroutines.**
-keep class kotlinx.coroutines.** { *; }

# Hilt & Dagger
-keepattributes *ElementPreciseType*
-dontwarn dagger.hilt.internal.aggregateddeps.AggregatedDeps

# Kotlin Serialization
-keepclassmembers class * {
    *** Companion;
}
-keepclasseswithmembers class * {
    *** serializer(...);
}
-keepclassmembers class * {
    @kotlinx.serialization.Serializable *;
}
-keepclassmembers class * {
    @kotlinx.serialization.SerialName *;
}

# Ktor
-dontwarn io.ktor.**
-keep class io.ktor.** { *; }

# OkHttp / Okio
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.annotation.**
-dontwarn org.conscrypt.**
-dontwarn org.openjsse.**

# SLF4J (Resolve missing StaticLoggerBinder)
-dontwarn org.slf4j.**

# Room
-dontwarn androidx.room.**

# ZXing
-dontwarn com.google.zxing.**
-keep class com.google.zxing.** { *; }
